﻿



import "./env.js";
import crypto from "crypto";
import express from "express";
import cors from "cors";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

import {
  createRecord,
  listFields,
  listRecords,
  listRecordsWithMeta,
  updateRecord,
  sendMessageToUser,
} from "./feishu.js";
import {

  getCustomers,

  batchCreateRecords,

  getRecordById,

} from "./feishu.js";



const app = express();

app.use(cors({ origin: true, credentials: true }));

app.use(express.json({ limit: "2mb" }));

const API_CACHE_TTL_MS = Number(process.env.API_CACHE_TTL_MS || 30000);
const apiCache = new Map();
const IDEMPOTENCY_TTL_MS = Number(process.env.IDEMPOTENCY_TTL_MS || 15000);
const idempotencyCache = new Map();

const stableStringify = (value) => {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value).sort();
  const entries = keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`);
  return `{${entries.join(",")}}`;
};

const pruneIdempotencyCache = () => {
  const now = Date.now();
  for (const [key, entry] of idempotencyCache.entries()) {
    if (!entry || entry.expiresAt <= now) idempotencyCache.delete(key);
  }
};

const buildIdempotencyKey = (req) => {
  const headerKey = String(req.headers["x-idempotency-key"] || "").trim();
  if (headerKey) return `h:${headerKey}`;
  const body = req.body || {};
  const raw = `${req.method}:${req.path}:${stableStringify(body)}`;
  return crypto.createHash("sha256").update(raw).digest("hex");
};

const withIdempotency = async (req, res, handler) => {
  pruneIdempotencyCache();
  const key = buildIdempotencyKey(req);
  const now = Date.now();
  const cached = idempotencyCache.get(key);
  if (cached?.response) {
    return res.json({ ...cached.response, duplicate: true });
  }
  if (cached?.pending) {
    return res.status(202).json({ success: true, duplicate: true, pending: true });
  }
  idempotencyCache.set(key, { pending: true, expiresAt: now + IDEMPOTENCY_TTL_MS });

  let captured = null;
  const originalJson = res.json.bind(res);
  res.json = (payload) => {
    captured = payload;
    if (payload && payload.success === true) {
      idempotencyCache.set(key, {
        response: payload,
        expiresAt: Date.now() + IDEMPOTENCY_TTL_MS,
      });
    } else {
      idempotencyCache.delete(key);
    }
    return originalJson(payload);
  };

  try {
    await handler();
    if (!captured) idempotencyCache.delete(key);
  } catch (e) {
    idempotencyCache.delete(key);
    throw e;
  }
};
function getCached(key) {
  const hit = apiCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expireAt) {
    apiCache.delete(key);
    return null;
  }
  return hit.value;
}
async function withCache(key, ttlMs, fetcher) {
  if (!ttlMs || ttlMs <= 0) return fetcher();
  const cached = getCached(key);
  if (cached !== null) return cached;
  const value = await fetcher();
  apiCache.set(key, { value, expireAt: Date.now() + ttlMs });
  return value;
}



const PORT = process.env.PORT || 4000;

const BUILD_ID = `BDdaily-${new Date().toISOString()}`;

const PROJECT_APP_TOKEN = process.env.FEISHU_PROJECT_APP_TOKEN || process.env.FEISHU_BITABLE_APP_TOKEN;

const PROJECT_TABLE_ID = process.env.FEISHU_BITABLE_PROJECT_TABLE_ID;

const DEAL_APP_TOKEN = process.env.FEISHU_DEAL_APP_TOKEN || PROJECT_APP_TOKEN;

const DEAL_TABLE_ID = process.env.FEISHU_BITABLE_DEAL_TABLE_ID;

const COST_APP_TOKEN =
  process.env.FEISHU_COST_APP_TOKEN ||
  process.env.FEISHU_THIRD_PARTY_COST_APP_TOKEN ||
  PROJECT_APP_TOKEN ||
  process.env.FEISHU_BITABLE_APP_TOKEN;
const COST_TABLE_ID =
  process.env.FEISHU_BITABLE_COST_TABLE_ID ||
  process.env.FEISHU_BITABLE_THIRD_PARTY_COST_TABLE_ID;

const KANBAN_APP_TOKEN = process.env.FEISHU_KANBAN_APP_TOKEN || process.env.FEISHU_BITABLE_APP_TOKEN;
const KANBAN_BOARD_ID = process.env.FEISHU_KANBAN_BOARD_ID;
const KANBAN_EMBED_URL = process.env.FEISHU_KANBAN_EMBED_URL;
const KANBAN_EMBED_BASE_URL = process.env.FEISHU_KANBAN_EMBED_BASE_URL;
const DASHBOARD_EMBED_URL = process.env.FEISHU_DASHBOARD_EMBED_URL;
const DAILY_FORM_URL = process.env.DAILY_FORM_URL || "";
const DAILY_FORM_BD_OPEN_IDS = String(process.env.DAILY_FORM_BD_OPEN_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const DAILY_FORM_WEEKLY_OPEN_IDS = String(process.env.DAILY_FORM_WEEKLY_OPEN_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const DAILY_FORM_WEEKLY_DAY = (() => {
  const raw = Number(process.env.DAILY_FORM_WEEKLY_DAY);
  return Number.isFinite(raw) && raw >= 0 && raw <= 6 ? raw : 1; // default Monday
})();
const CRON_SECRET = String(process.env.CRON_SECRET || "").trim();
const AUTH_LINK_SECRET = String(process.env.FEISHU_AUTH_LINK_SECRET || "").trim();
const AUTH_LINK_TTL_MINUTES = Number(process.env.FEISHU_AUTH_LINK_TTL_MINUTES || 10);
const AUTH_LINK_BASE_URL = String(process.env.FEISHU_AUTH_LINK_BASE_URL || "").trim();
const AUTH_WHITELIST_RAW = String(process.env.FEISHU_AUTH_WHITELIST || "").trim();

let cachedJsapiTicket = null;
let jsapiTicketExpireAt = 0;

function getUserAccessToken(req) {
  const auth = String(req.headers.authorization || "");
  if (auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  const headerToken = String(req.headers["x-feishu-user-access-token"] || "").trim();
  if (headerToken) return headerToken;
  const envToken = String(process.env.FEISHU_USER_ACCESS_TOKEN || "").trim();
  return envToken;
}

function getCurrentOpenId(req) {
  const headerOpenId = String(req.headers["x-feishu-open-id"] || "").trim();
  if (headerOpenId) return headerOpenId;
  const envOpenId = String(process.env.FEISHU_OPEN_ID || process.env.FEISHU_USER_OPEN_ID || "").trim();
  return envOpenId;
}

const authWhitelist = buildAuthWhitelist(AUTH_WHITELIST_RAW);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USAGE_STORE_PATH = path.join(__dirname, "data", "daily_form_usage.json");

const formatLocalDate = (date) => {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const normalizeUsageDate = (value) => {
  if (!value) return formatLocalDate(new Date());
  if (value instanceof Date) return formatLocalDate(value);
  const raw = String(value || "").trim();
  if (!raw) return formatLocalDate(new Date());
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(raw)) {
    const [y, m, d] = raw.replace(/\//g, "-").split("-");
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return formatLocalDate(parsed);
  return formatLocalDate(new Date());
};

async function readUsageStore() {
  try {
    const raw = await fs.readFile(USAGE_STORE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.entries && typeof parsed.entries === "object") {
      return { version: 1, entries: parsed.entries };
    }
  } catch {
    // ignore read/parse errors
  }
  return { version: 1, entries: {} };
}

async function writeUsageStore(store) {
  await fs.mkdir(path.dirname(USAGE_STORE_PATH), { recursive: true });
  const tmp = `${USAGE_STORE_PATH}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(store, null, 2), "utf8");
  await fs.rename(tmp, USAGE_STORE_PATH);
}

async function markUsageEntry({ openId, name, username, date }) {
  const normalizedOpenId = String(openId || "").trim();
  if (!normalizedOpenId) return null;
  const usageDate = normalizeUsageDate(date);
  const store = await readUsageStore();
  const key = `${usageDate}|${normalizedOpenId}`;
  const existing = store.entries[key] || {
    date: usageDate,
    openId: normalizedOpenId,
    name: String(name || "").trim(),
    username: String(username || "").trim(),
    count: 0,
    lastAt: "",
  };
  if (!existing.count || Number(existing.count) < 1) {
    existing.count = 1;
  }
  existing.lastAt = new Date().toISOString();
  if (name) existing.name = String(name || "").trim();
  if (username) existing.username = String(username || "").trim();
  store.entries[key] = existing;
  await writeUsageStore(store);
  return existing;
}

function base64UrlEncode(value) {
  return Buffer.from(String(value || ""), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(value) {
  const raw = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const pad = raw.length % 4 ? "=".repeat(4 - (raw.length % 4)) : "";
  return Buffer.from(`${raw}${pad}`, "base64").toString("utf8");
}

function signAuthPayload(payload) {
  if (!AUTH_LINK_SECRET) return "";
  return crypto
    .createHmac("sha256", AUTH_LINK_SECRET)
    .update(String(payload || ""), "utf8")
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function issueAuthToken(user, ttlMinutes = AUTH_LINK_TTL_MINUTES) {
  const now = Date.now();
  const ttlMs =
    Number.isFinite(ttlMinutes) && ttlMinutes > 0 ? ttlMinutes * 60 * 1000 : 10 * 60 * 1000;
  const payload = {
    openId: user.openId || "",
    username: user.username || "",
    name: user.name || "",
    iat: now,
    exp: now + ttlMs,
  };
  const payloadRaw = JSON.stringify(payload);
  const payloadB64 = base64UrlEncode(payloadRaw);
  const signature = signAuthPayload(payloadB64);
  return { token: `${payloadB64}.${signature}`, payload };
}

function verifyAuthToken(token) {
  const raw = String(token || "").trim();
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, signature] = parts;
  const expected = signAuthPayload(payloadB64);
  if (!expected || !safeEqual(signature, expected)) return null;
  let payload;
  try {
    payload = JSON.parse(base64UrlDecode(payloadB64));
  } catch (e) {
    return null;
  }
  if (!payload || typeof payload !== "object") return null;
  const exp = Number(payload.exp || 0);
  if (!Number.isFinite(exp) || exp <= Date.now()) return null;
  const user = resolveAuthUser({
    openId: payload.openId,
    username: payload.username,
    name: payload.name,
  });
  if (!user) return null;
  return { payload, user };
}

function resolveAuthOrigin(req) {
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const proto = forwardedProto || req.protocol || "http";
  const forwardedHost = String(req.headers["x-forwarded-host"] || "").split(",")[0].trim();
  const host = forwardedHost || req.headers.host || "";
  if (!host) return "";
  return `${proto}://${host}`;
}

function buildAuthLink(req, token, redirect) {
  const origin = resolveAuthOrigin(req);
  const base = AUTH_LINK_BASE_URL || (origin ? `${origin}/login` : "");
  if (!base) return "";
  const url = new URL(base, origin || undefined);
  url.searchParams.set("token", token);
  if (redirect) {
    url.searchParams.set("redirect", String(redirect));
  }
  return url.toString();
}

function normalizeAuthRecord(record) {
  if (!record) return null;
  const openId = String(record.openId || record.open_id || record.id || "").trim();
  const username = String(record.username || record.user || record.account || "").trim();
  const name = String(record.name || record.displayName || record.realName || "").trim();
  const fallback = username || name || openId;
  if (!openId && !fallback) return null;
  return {
    openId,
    username: username || fallback,
    name: name || username || fallback,
  };
}

function buildAuthWhitelist(raw) {
  const byOpenId = new Map();
  const byUsername = new Map();
  const addRecord = (record) => {
    if (!record) return;
    const openId = String(record.openId || "").trim();
    const username = String(record.username || "").trim();
    const name = String(record.name || "").trim();
    const normalized = {
      openId,
      username: username || name || openId,
      name: name || username || openId,
    };
    if (normalized.openId) byOpenId.set(normalized.openId, normalized);
    if (normalized.username) byUsername.set(normalized.username.toLowerCase(), normalized);
  };

  const trimmed = String(raw || "").trim();
  if (!trimmed) {
    return { allowAll: false, byOpenId, byUsername };
  }
  if (trimmed === "*" || trimmed.toLowerCase() === "all") {
    return { allowAll: true, byOpenId, byUsername };
  }

  let parsed = null;
  try {
    parsed = JSON.parse(trimmed);
  } catch (e) {
    parsed = null;
  }

  if (Array.isArray(parsed)) {
    for (const entry of parsed) {
      if (typeof entry === "string") {
        addRecord(normalizeAuthRecord(parseWhitelistString(entry)));
      } else if (entry && typeof entry === "object") {
        addRecord(normalizeAuthRecord(entry));
      }
    }
  } else if (parsed && typeof parsed === "object") {
    for (const [key, value] of Object.entries(parsed)) {
      if (value && typeof value === "object") {
        addRecord(normalizeAuthRecord({ openId: value.openId || key, ...value }));
      } else if (typeof value === "string") {
        addRecord(normalizeAuthRecord({ openId: key, name: value, username: value }));
      } else {
        addRecord(normalizeAuthRecord({ openId: key }));
      }
    }
  } else {
    const entries = trimmed
      .split(/[\n,]+/)
      .map((entry) => entry.trim())
      .filter(Boolean);
    for (const entry of entries) {
      addRecord(normalizeAuthRecord(parseWhitelistString(entry)));
    }
  }

  return { allowAll: false, byOpenId, byUsername };
}

function parseWhitelistString(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const pipeParts = raw.split("|").map((part) => part.trim()).filter(Boolean);
  const parts = pipeParts.length > 1 ? pipeParts : raw.split(":").map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return null;
  if (parts.length === 1) {
    return { openId: parts[0] };
  }
  return { openId: parts[0], username: parts[1], name: parts[2] || parts[1] };
}

function resolveAuthUser({ openId, username, name } = {}) {
  const normalizedOpenId = String(openId || "").trim();
  const normalizedUsername = String(username || "").trim();
  const normalizedName = String(name || "").trim();

  if (authWhitelist.allowAll) {
    const fallback = normalizedName || normalizedUsername || normalizedOpenId;
    if (!fallback) return null;
    return {
      openId: normalizedOpenId,
      username: normalizedUsername || fallback,
      name: normalizedName || normalizedUsername || fallback,
    };
  }

  if (normalizedOpenId && authWhitelist.byOpenId.has(normalizedOpenId)) {
    return authWhitelist.byOpenId.get(normalizedOpenId);
  }
  const byUsername =
    (normalizedUsername && authWhitelist.byUsername.get(normalizedUsername.toLowerCase())) ||
    (normalizedName && authWhitelist.byUsername.get(normalizedName.toLowerCase()));
  return byUsername || null;
}

function extractAuthParams(req) {
  const body = req.body || {};
  const query = req.query || {};
  const openId =
    body.openId ??
    body.open_id ??
    body.openID ??
    query.openId ??
    query.open_id ??
    query.openID ??
    "";
  const username = body.username ?? body.user ?? body.account ?? query.username ?? query.user ?? query.account ?? "";
  const name = body.name ?? body.displayName ?? body.realName ?? query.name ?? query.displayName ?? query.realName ?? "";
  const redirect = body.redirect ?? query.redirect ?? "";
  return {
    openId: String(openId || "").trim(),
    username: String(username || "").trim(),
    name: String(name || "").trim(),
    redirect: String(redirect || "").trim(),
  };
}

async function getJsapiTicket(userAccessToken) {
  if (cachedJsapiTicket && Date.now() < jsapiTicketExpireAt) return cachedJsapiTicket;

  const res = await fetch("https://open.feishu.cn/open-apis/jssdk/ticket/get", {
    method: "GET",
    headers: { Authorization: `Bearer ${userAccessToken}` },
  });

  const json = await res.json().catch(() => ({}));
  if (json?.code !== 0) {
    throw new Error(`jssdk/ticket/get failed: ${JSON.stringify(json)}`);
  }

  const ticket = json?.data?.ticket || "";
  const expireIn = Number(json?.data?.expire_in || 0);
  if (!ticket) throw new Error("jssdk/ticket/get: missing ticket");

  cachedJsapiTicket = ticket;
  jsapiTicketExpireAt = Date.now() + Math.max(0, expireIn - 60) * 1000;
  return ticket;
}

function sendKanbanPlaceholder(res, data, extra = {}) {
  return res.json({
    success: true,
    reserved: true,

    data: data ?? null,

    hint: "Kanban API placeholder; connect to Feishu Kanban later.",

    ...extra,

  });

}

function resolveKanbanEmbedUrl() {
  const boardId = KANBAN_BOARD_ID || "";

  const replaceBoardId = (value) => {
    if (!value || !boardId) return value;
    return value
      .replaceAll("{boardId}", boardId)
      .replaceAll("{{boardId}}", boardId)
      .replaceAll("${boardId}", boardId);
  };

  const withEmbedParams = (value) => {
    if (!value) return "";
    try {
      const url = new URL(value);
      if (!url.searchParams.has("iframeFrom")) {
        url.searchParams.set("iframeFrom", "docx");
      }
      if (!url.searchParams.has("ccm_open")) {
        url.searchParams.set("ccm_open", "iframe");
      }
      return url.toString();
    } catch (e) {
      return value;
    }
  };

  if (KANBAN_EMBED_URL) {
    return withEmbedParams(replaceBoardId(KANBAN_EMBED_URL));
  }

  if (KANBAN_EMBED_BASE_URL && boardId) {
    const normalizedBase = KANBAN_EMBED_BASE_URL.endsWith("/")
      ? KANBAN_EMBED_BASE_URL
      : `${KANBAN_EMBED_BASE_URL}/`;
    return withEmbedParams(`${normalizedBase}${boardId}`);
  }

  if (DASHBOARD_EMBED_URL) {
    try {
      const url = new URL(DASHBOARD_EMBED_URL);
      if (boardId) {
        const hash = url.hash.replace(/^#/, "");
        if (!hash.includes("block_id=")) {
          url.hash = `block_id=${boardId}`;
        }
      }
      return withEmbedParams(url.toString());
    } catch (e) {
      return withEmbedParams(DASHBOARD_EMBED_URL);
    }
  }

  return "";
}



// ====== DEBUG：确认当?server / env ======

app.get("/api/debug-env", (req, res) => {

  res.json({

    buildId: BUILD_ID,

    cwd: process.cwd(),

    fileHint: "server/index.js",

    env: {

      FEISHU_APP_ID: process.env.FEISHU_APP_ID || null,

      FEISHU_APP_SECRET: process.env.FEISHU_APP_SECRET ? "***" : null,

      FEISHU_BITABLE_APP_TOKEN: process.env.FEISHU_BITABLE_APP_TOKEN || null,

      FEISHU_BITABLE_TABLE_ID: process.env.FEISHU_BITABLE_TABLE_ID || null,

      FEISHU_PROJECT_APP_TOKEN: PROJECT_APP_TOKEN || null,

      FEISHU_BITABLE_PROJECT_TABLE_ID: PROJECT_TABLE_ID || null,

      PORT: process.env.PORT || null,

      NODE_ENV: process.env.NODE_ENV || null,

    },

  });

});

// ====== Auth link ======
const issueAuthLink = (req, res) => {
  if (!AUTH_LINK_SECRET) {
    return res.status(500).json({ success: false, error: "FEISHU_AUTH_LINK_SECRET not configured" });
  }
  if (!authWhitelist.allowAll && authWhitelist.byOpenId.size === 0 && authWhitelist.byUsername.size === 0) {
    return res.status(403).json({ success: false, error: "auth whitelist not configured" });
  }
  const { openId, username, name, redirect } = extractAuthParams(req);
  const user = resolveAuthUser({ openId, username, name });
  if (!user) {
    return res.status(403).json({ success: false, error: "user not in whitelist" });
  }
  const { token, payload } = issueAuthToken(user);
  const url = buildAuthLink(req, token, redirect);
  if (!url) {
    return res.status(500).json({ success: false, error: "unable to build login link" });
  }
  return res.json({
    success: true,
    data: {
      url,
      token,
      expiresAt: payload.exp,
      user,
    },
  });
};

app.post("/api/auth/link", issueAuthLink);
app.get("/api/auth/link", issueAuthLink);

app.post("/api/auth/send-link", async (req, res) => {
  if (!AUTH_LINK_SECRET) {
    return res.status(500).json({ success: false, error: "FEISHU_AUTH_LINK_SECRET not configured" });
  }
  if (!authWhitelist.allowAll && authWhitelist.byOpenId.size === 0 && authWhitelist.byUsername.size === 0) {
    return res.status(403).json({ success: false, error: "auth whitelist not configured" });
  }
  const { openId, username, name, redirect } = extractAuthParams(req);
  const user = resolveAuthUser({ openId, username, name });
  if (!user) {
    return res.status(403).json({ success: false, error: "user not in whitelist" });
  }
  if (!user.openId) {
    return res.status(400).json({ success: false, error: "openId required to send message" });
  }
  const { token, payload } = issueAuthToken(user);
  const url = buildAuthLink(req, token, redirect);
  if (!url) {
    return res.status(500).json({ success: false, error: "unable to build login link" });
  }
  const ttlMinutes =
    Number.isFinite(AUTH_LINK_TTL_MINUTES) && AUTH_LINK_TTL_MINUTES > 0 ? AUTH_LINK_TTL_MINUTES : 10;
  const message = `每日表单系统登录链接（${ttlMinutes}分钟内有效）：${url}`;
  try {
    const data = await sendMessageToUser(user.openId, message);
    return res.json({
      success: true,
      data: {
        url,
        expiresAt: payload.exp,
        openId: user.openId,
        messageId: data?.message_id || null,
      },
    });
  } catch (e) {
    console.error("POST /api/auth/send-link failed:", e);
    return res.status(500).json({ success: false, error: String(e) });
  }
});

app.get("/api/auth/verify", (req, res) => {
  if (!AUTH_LINK_SECRET) {
    return res.status(500).json({ success: false, error: "FEISHU_AUTH_LINK_SECRET not configured" });
  }
  if (!authWhitelist.allowAll && authWhitelist.byOpenId.size === 0 && authWhitelist.byUsername.size === 0) {
    return res.status(403).json({ success: false, error: "auth whitelist not configured" });
  }
  const token = String(req.query.token || "").trim();
  if (!token) {
    return res.status(400).json({ success: false, error: "missing token" });
  }
  const verified = verifyAuthToken(token);
  if (!verified) {
    return res.status(401).json({ success: false, error: "invalid token" });
  }
  const user = verified.user;
  const id = user.openId ? `feishu-${user.openId}` : `user-${user.username || "unknown"}`;
  if (user.openId) {
    markUsageEntry({
      openId: user.openId,
      name: user.name || user.username,
      username: user.username,
      date: new Date(),
    }).catch((e) => console.error("markUsageEntry failed:", e));
  }
  return res.json({
    success: true,
    data: {
      id,
      username: user.username || user.openId,
      name: user.name || user.username || user.openId,
      openId: user.openId || "",
    },
  });
});

// ====== Daily form usage ======
app.post("/api/usage/mark", async (req, res) => {
  try {
    const body = req.body || {};
    const openId = String(body.openId || body.open_id || "").trim();
    const username = String(body.username || body.user || "").trim();
    const name = String(body.name || body.displayName || "").trim();
    const date = normalizeUsageDate(body.date);

    let user = resolveAuthUser({ openId, username, name });
    if (!user && openId) {
      user = {
        openId,
        username: username || openId,
        name: name || username || openId,
      };
    }
    if (!user || !user.openId) {
      return res.status(400).json({ success: false, error: "missing user identity" });
    }

    const entry = await markUsageEntry({
      openId: user.openId,
      name: user.name || "",
      username: user.username || "",
      date,
    });
    return res.json({ success: true, data: entry });
  } catch (e) {
    console.error("POST /api/usage/mark failed:", e);
    return res.status(500).json({ success: false, error: String(e) });
  }
});

app.get("/api/usage/list", async (req, res) => {
  try {
    const daysRaw = Number(req.query.days);
    const maxDays = 31;
    const days = Number.isFinite(daysRaw) && daysRaw > 0 ? Math.min(daysRaw, maxDays) : 7;

    const toRaw = String(req.query.to || "").trim();
    const fromRaw = String(req.query.from || "").trim();

    let end = toRaw ? new Date(toRaw) : new Date();
    if (Number.isNaN(end.getTime())) end = new Date();
    end = new Date(end.getFullYear(), end.getMonth(), end.getDate());

    let start = fromRaw ? new Date(fromRaw) : new Date(end);
    if (Number.isNaN(start.getTime())) start = new Date(end);
    start = new Date(start.getFullYear(), start.getMonth(), start.getDate());

    if (!fromRaw) {
      start.setDate(end.getDate() - (days - 1));
    }
    if (start > end) {
      const tmp = start;
      start = end;
      end = tmp;
    }

    const dates = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      dates.push(formatLocalDate(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }

    const store = await readUsageStore();
    const users = Array.from(authWhitelist.byOpenId.values())
      .filter((u) => u?.openId)
      .map((u) => ({
        openId: u.openId,
        name: u.name || u.username || u.openId,
        username: u.username || "",
      }))
      .sort((a, b) => String(a.name).localeCompare(String(b.name), "zh-CN"));

    const usage = {};
    dates.forEach((d) => {
      usage[d] = {};
    });
    for (const entry of Object.values(store.entries || {})) {
      const date = entry?.date;
      const openId = entry?.openId;
      if (!date || !openId || !usage[date]) continue;
      usage[date][openId] = entry;
    }

    return res.json({ success: true, data: { dates, users, usage } });
  } catch (e) {
    console.error("GET /api/usage/list failed:", e);
    return res.status(500).json({ success: false, error: String(e) });
  }
});

// ====== 定时提醒：每日表单 ======
app.get("/api/notify/daily", async (req, res) => {
  try {
    const isCron = String(req.headers["x-vercel-cron"] || "").toLowerCase() === "true";
    console.log("notify daily", { isCron, query: req.query });
    if (CRON_SECRET) {
      const header = String(req.headers.authorization || "");
      const headerToken = header.toLowerCase().startsWith("bearer ")
        ? header.slice(7).trim()
        : "";
      const queryToken = String(req.query.token || req.query.secret || "").trim();
      const token = headerToken || queryToken;
      if (!token || token !== CRON_SECRET) {
        return res.status(401).json({ success: false, error: "unauthorized" });
      }
    }

    const url = String(req.query.url || DAILY_FORM_URL || "").trim();
    if (!url) {
      return res.status(400).json({ success: false, error: "missing DAILY_FORM_URL" });
    }

    const title = String(req.query.title || "每日表单填写链接").trim();
    const loginRedirect = String(req.query.loginRedirect || req.query.redirect || "").trim();
    const ttlMinutes =
      Number.isFinite(AUTH_LINK_TTL_MINUTES) && AUTH_LINK_TTL_MINUTES > 0 ? AUTH_LINK_TTL_MINUTES : 10;
    const canIssueLoginLink =
      Boolean(AUTH_LINK_SECRET) &&
      (authWhitelist.allowAll || authWhitelist.byOpenId.size > 0 || authWhitelist.byUsername.size > 0);

    const openIdQuery =
      req.query.openIds ??
      req.query.open_ids ??
      req.query.openId ??
      req.query.open_id ??
      "";
    const openIdsFromQuery = Array.isArray(openIdQuery)
      ? openIdQuery
          .map((value) => String(value || "").trim())
          .filter(Boolean)
      : String(openIdQuery || "")
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean);
    const unique = (list) => Array.from(new Set(list.filter(Boolean)));
    const dailyIds = DAILY_FORM_BD_OPEN_IDS.length
      ? DAILY_FORM_BD_OPEN_IDS
      : [
          "ou_a58586d5eae4171246d9514720e46db7",
          "ou_b89e947decf816f6f337f873358a52ec",
          "ou_f5dac90ed9608641db9db9fa39e2a0ec",
        ];
    const weeklyCandidates = DAILY_FORM_WEEKLY_OPEN_IDS.length
      ? DAILY_FORM_WEEKLY_OPEN_IDS
      : Array.from(authWhitelist.byOpenId.keys());
    const dailySet = new Set(dailyIds);
    const weeklyIds = unique(weeklyCandidates).filter((id) => !dailySet.has(id));
    const weeklySet = new Set(weeklyIds);
    const isWeeklyDay = new Date().getDay() === DAILY_FORM_WEEKLY_DAY;
    const scheduledOpenIds = isWeeklyDay ? unique([...dailyIds, ...weeklyIds]) : dailyIds;
    const openIds = openIdsFromQuery.length ? openIdsFromQuery : scheduledOpenIds;
    const ttlDays = Math.max(1, Math.ceil(ttlMinutes / (60 * 24)));

    let text = `${title}：${url}`;
    if (title.includes("提醒预览")) {
      text = `请进入AI策略 DAILY或点击链接中的"提醒预览"，查收需要跟进的项目提醒：${url}`;
    } else if (title.includes("每日表单")) {
      text = `请进入AI策略 DAILY或点击链接中的"每日表单"进行填写：${url}`;
    }
    const defaultRedirect = loginRedirect || (title.includes("提醒预览") ? "/app/reminders" : title.includes("每日表单") ? "/app/daily" : "/app");
    const results = [];
    for (const openId of openIds) {
      try {
        let loginUrl = "";
        let loginError = null;
        if (canIssueLoginLink) {
          const user = resolveAuthUser({ openId });
          if (user) {
            const { token } = issueAuthToken(user);
            loginUrl = buildAuthLink(req, token, defaultRedirect);
            if (!loginUrl) loginError = "unable to build login link";
          } else {
            loginError = "user not in whitelist";
          }
        } else {
          loginError = "auth link not configured";
        }
        const isDailyUser = dailySet.has(openId);
        const isWeeklyUser = !isDailyUser && weeklySet.has(openId);
        const link = loginUrl || url;
        const specialMessage =
          isWeeklyUser
            ? `通过以下链接访问客户及项目数据（链接${ttlDays}日内有效）：${link}`
            : isDailyUser && title.includes("提醒预览")
            ? `请进入售前小程序中的"提醒预览"，查收需要跟进的项目提醒（链接${ttlDays}日内有效）：${link}`
            : isDailyUser && title.includes("每日表单")
              ? `请进入售前小程序中的"每日表单"进行填写（链接${ttlDays}日内有效）：${link}`
              : null;
        const message = specialMessage
          ? specialMessage
          : loginUrl
            ? `${text}\n登录链接（${ttlMinutes}分钟内有效）：${loginUrl}`
            : text;
        const data = await sendMessageToUser(openId, message);
        results.push({ openId, success: true, data, loginUrl: loginUrl || null, loginError });
      } catch (e) {
        results.push({ openId, success: false, error: String(e) });
      }
    }

    res.json({ success: true, count: results.length, results });
  } catch (e) {
    console.error("GET /api/notify/daily failed:", e);
    res.status(500).json({ success: false, error: String(e) });
  }
});
// ====== UserProfile Config ======
app.get("/api/feishu/user-profile-config", async (req, res) => {
  try {
    const rawUrl = String(req.query.url || "").trim();
    let url = rawUrl;

    if (!url) {
      const referer = String(req.headers.referer || req.headers.referrer || "").trim();
      if (referer) {
        url = referer.split("#")[0].split("?")[0];
      }
    }

    if (!url) {
      const origin = String(req.headers.origin || "").trim();
      url = origin;
    }

    const appId = String(process.env.FEISHU_APP_ID || "").trim();
    const openId = getCurrentOpenId(req);
    const nonceStr = crypto.randomBytes(8).toString("hex");
    const timestamp = String(Date.now());

    const userAccessToken = getUserAccessToken(req);
    if (!userAccessToken) {
      // TODO: replace with real user_access_token from your login/session middleware.
      const signature = crypto
        .createHash("sha1")
        .update(`jsapi_ticket=mock&noncestr=${nonceStr}&timestamp=${timestamp}&url=${url}`)
        .digest("hex");

      return res.json({
        appId,
        openId,
        timestamp,
        nonceStr,
        signature,
        url,
        jsApiList: ["user_profile"],
        locale: "zh-CN",
        theme: "light",
      });
    }

    const jsapiTicket = await getJsapiTicket(userAccessToken);
    const string1 = `jsapi_ticket=${jsapiTicket}&noncestr=${nonceStr}&timestamp=${timestamp}&url=${url}`;
    const signature = crypto.createHash("sha1").update(string1).digest("hex");

    return res.json({
      appId,
      openId,
      timestamp,
      nonceStr,
      signature,
      url,
      jsApiList: ["user_profile"],
      locale: "zh-CN",
      theme: "light",
    });
  } catch (e) {
    console.error("GET /api/feishu/user-profile-config failed:", e);
    res.status(500).json({ error: String(e) });
  }
});



// ====== 读取客户 ======

app.get("/api/customers", async (req, res) => {

  try {

    const keyword = (req.query.keyword || "").toString().trim();

    const cacheKey = `customers:${keyword || "all"}`;
    const data = await withCache(cacheKey, API_CACHE_TTL_MS, () => getCustomers({ keyword }));

    res.json({ success: true, data });

  } catch (e) {

    console.error("GET /api/customers failed:", e);

    res.status(500).json({ success: false, error: String(e) });

  }

});

// ====== 客户表字段选项（用于前端下拉同步）======
app.get("/api/customer-field-options", async (req, res) => {
  try {
    const appToken = process.env.FEISHU_BITABLE_APP_TOKEN;
    const tableId = process.env.FEISHU_BITABLE_TABLE_ID;

    if (!appToken || !tableId) {
      return res.status(500).json({
        success: false,
        error: "missing customer appToken/tableId",
      });
    }

    const rawFields = (req.query.fields || "").toString().trim();
    const names =
      rawFields
        ? rawFields.split(",").map((s) => s.trim()).filter(Boolean)
        : ["线索月份", "客户类型", "客户等级", "行业大类"];

    const infoMap = await getFieldInfoMap(appToken, tableId);
    const data = {};
    names.forEach((name) => {
      const info = infoMap.get(normalizeFieldName(name));
      const options = Array.isArray(info?.options)
        ? info.options.map((opt) => opt?.name).filter(Boolean)
        : [];
      data[name] = Array.from(new Set(options));
    });

    res.json({ success: true, data });
  } catch (e) {
    console.error("GET /api/customer-field-options failed:", e);
    res.status(500).json({ success: false, error: String(e) });
  }
});

// ====== 项目进度表字段选项（用于前端下拉同步）======
app.get("/api/project-field-options", async (req, res) => {
  try {
    const appToken = PROJECT_APP_TOKEN;
    const tableId = PROJECT_TABLE_ID;

    if (!appToken || !tableId) {
      return res.status(500).json({
        success: false,
        error: "missing project appToken/tableId",
      });
    }

    const rawFields = (req.query.fields || "").toString().trim();
    const names =
      rawFields
        ? rawFields.split(",").map((s) => s.trim()).filter(Boolean)
        : ["所属年月", "所属月份", "服务类型", "平台", "项目类别", "项目进度", "优先级"];

    const infoMap = await getFieldInfoMap(appToken, tableId);
    const data = {};
    names.forEach((name) => {
      const info = infoMap.get(normalizeFieldName(name));
      const options = Array.isArray(info?.options)
        ? info.options.map((opt) => opt?.name).filter(Boolean)
        : [];
      data[name] = Array.from(new Set(options));
    });

    res.json({ success: true, data });
  } catch (e) {
    console.error("GET /api/project-field-options failed:", e);
    res.status(500).json({ success: false, error: String(e) });
  }
});

// ====== 立项表字段选项（用于前端下拉同步）======
app.get("/api/deal-field-options", async (req, res) => {
  try {
    const appToken = DEAL_APP_TOKEN;
    const tableId = DEAL_TABLE_ID;

    if (!appToken || !tableId) {
      return res.status(500).json({
        success: false,
        error: "missing deal appToken/tableId",
      });
    }

    const rawFields = (req.query.fields || "").toString().trim();
    const names =
      rawFields
        ? rawFields.split(",").map((s) => s.trim()).filter(Boolean)
        : ["所属年月", "所属月份", "签约公司主体"];

    const infoMap = await getFieldInfoMap(appToken, tableId);
    const data = {};
    names.forEach((name) => {
      const info = infoMap.get(normalizeFieldName(name));
      const options = Array.isArray(info?.options)
        ? info.options.map((opt) => opt?.name).filter(Boolean)
        : [];
      data[name] = Array.from(new Set(options));
    });

    res.json({ success: true, data });
  } catch (e) {
    console.error("GET /api/deal-field-options failed:", e);
    res.status(500).json({ success: false, error: String(e) });
  }
});



// ====== 写回飞书客户表（最稳：?field_id 写入，避免字段名空格/隐形字符?======

const cachedFieldMap = new Map();
const cachedFieldMapExpireAt = new Map();

const cachedFieldInfoMap = new Map();
const cachedFieldInfoExpireAt = new Map();

const normalizeFieldName = (value) => String(value || "").replace(/\s+/g, "");
const normalizeOptionValue = (value) =>
  String(value || "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[./]/g, "-");



async function getFieldMap(appToken, tableId) {

  const now = Date.now();

  const key = `${appToken}::${tableId}`;
  const expireAt = cachedFieldMapExpireAt.get(key) || 0;
  if (cachedFieldMap.has(key) && now < expireAt) return cachedFieldMap.get(key);



  const items = await listFields({ appToken, tableId });

  const map = new Map(); // field_name -> field_id

  (items || []).forEach((f) => {

    if (f?.field_name && f?.field_id) map.set(f.field_name, f.field_id);

  });



  cachedFieldMap.set(key, map);
  cachedFieldMapExpireAt.set(key, now + 60 * 1000); // 60s cache

  return map;

}



function findFieldId(fieldMap, expectedName) {

  // 1) 精确匹配

  if (fieldMap.has(expectedName)) return fieldMap.get(expectedName);



  // 2) 容错：忽略所有空白字符再匹配（解?“公司总部 地区?这种?
  const target = normalizeFieldName(expectedName);



  for (const [name, id] of fieldMap.entries()) {

    if (normalizeFieldName(name) === target) return id;

  }

  return null;

}

async function getFieldInfoMap(appToken, tableId) {
  const now = Date.now();
  const key = `${appToken}::${tableId}`;
  const expireAt = cachedFieldInfoExpireAt.get(key) || 0;
  if (cachedFieldInfoMap.has(key) && now < expireAt) return cachedFieldInfoMap.get(key);

  const items = await listFields({ appToken, tableId });
  const map = new Map(); // normalized field_name -> { name, type }
  (items || []).forEach((f) => {
    if (!f?.field_name) return;
    map.set(normalizeFieldName(f.field_name), {
      name: f.field_name,
      type: f.type,
      options: Array.isArray(f?.property?.options) ? f.property.options : [],
    });
  });

  cachedFieldInfoMap.set(key, map);
  cachedFieldInfoExpireAt.set(key, now + 60 * 1000);
  return map;
}

async function resolveFieldInfo(appToken, tableId, expectedName) {
  const infoMap = await getFieldInfoMap(appToken, tableId);
  const info = infoMap.get(normalizeFieldName(expectedName));
  return info || { name: expectedName, type: null };
}

function toSelectValue(value, fieldType) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  // 4 = multi-select in Feishu Bitable
  if (fieldType === 4) return [trimmed];
  return trimmed;
}

function resolveSelectOptionName(fieldInfo, inputValue) {
  const raw = String(inputValue || "").trim();
  if (!raw) return "";
  const options = Array.isArray(fieldInfo?.options) ? fieldInfo.options : [];
  if (options.length === 0) return raw;
  const target = normalizeOptionValue(raw);
  const match = options.find((opt) => normalizeOptionValue(opt?.name) === target);
  return match?.name || raw;
}

const READONLY_FIELD_TYPES = new Set([19, 20, 1001, 1002, 1005]);

function isReadonlyField(infoMap, expectedName) {
  if (!infoMap) return false;
  const info = infoMap.get(normalizeFieldName(expectedName));
  if (!info || info.type == null) return false;
  return READONLY_FIELD_TYPES.has(info.type);
}




function normalizePersonName(name) {
  return String(name || "")
    .trim()
    .replace(/\s+/g, "");
}

function pickPersonId(personObj) {
  if (!personObj || typeof personObj !== "object") return "";
  return (
    personObj.id ||
    personObj.user_id ||
    personObj.open_id ||
    personObj.openId ||
    personObj.userId ||
    personObj?.value?.id ||
    personObj?.value?.user_id ||
    ""
  );
}

function getPersonIdMapFromEnv() {
  const raw = String(process.env.FEISHU_PERSON_ID_MAP || "").trim();
  const map = new Map();
  if (!raw) return map;

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      parsed.forEach((item) => {
        const name = normalizePersonName(item?.name);
        const id = String(item?.id || "").trim();
        if (name && id) map.set(name, id);
      });
      return map;
    }
    if (parsed && typeof parsed === "object") {
      Object.entries(parsed).forEach(([name, id]) => {
        const key = normalizePersonName(name);
        const val = String(id || "").trim();
        if (key && val) map.set(key, val);
      });
      return map;
    }
  } catch {
    // fall through to csv parser
  }

  raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((pair) => {
      const [name, id] = pair.split(":").map((s) => s.trim());
      const key = normalizePersonName(name);
      const val = String(id || "").trim();
      if (key && val) map.set(key, val);
    });
  return map;
}

function readPersonIdMapFromEnv() {
  const map = getPersonIdMapFromEnv();
  return Array.from(map.entries()).map(([name, id]) => ({ name, id }));
}

async function resolvePersonFieldValue({ appToken, tableId, fieldName, input }) {
  if (input === undefined || input === null) return null;

  if (Array.isArray(input)) {
    const normalized = input.map((item) => {
      if (item && typeof item === "object") return { id: pickPersonId(item) || item.id };
      return null;
    });
    const valid = normalized.filter((item) => item?.id);
    if (valid.length) return valid;
  }

  if (typeof input === "object" && input !== null) {
    const id = pickPersonId(input);
    if (id) return [{ id }];
  }

  const target = normalizePersonName(input);
  if (!target) return null;

  const envMap = getPersonIdMapFromEnv();
  if (envMap.has(target)) return [{ id: envMap.get(target) }];

  const items = await listRecords({ appToken, tableId, pageSize: 200 });
  for (const it of items || []) {
    const v = it?.fields?.[fieldName];
    if (!Array.isArray(v)) continue;
    for (const personObj of v) {
      const name = normalizePersonName(personObj?.name);
      const id = pickPersonId(personObj);
      if (name && id && name === target) return [{ id }];
    }
  }

  return null;
}

async function getKnownPersonNames({ appToken, tableId, fieldName }) {
  const items = await listRecords({ appToken, tableId, pageSize: 200 });
  const names = new Set();
  for (const it of items || []) {
    const v = it?.fields?.[fieldName];
    if (!Array.isArray(v)) continue;
    for (const personObj of v) {
      const name = normalizePersonName(personObj?.name);
      if (name) names.add(name);
    }
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b, "zh-CN"));
}

async function resolveCustomerBdField(ownerBd) {
  const target = normalizePersonName(ownerBd);
  if (!target) return { value: null, known: [] };

  const envMap = getPersonIdMapFromEnv();
  if (envMap.has(target)) {
    return { value: [{ id: envMap.get(target) }], known: Array.from(envMap.keys()) };
  }

  if (!PROJECT_APP_TOKEN || !PROJECT_TABLE_ID) {
    return { value: null, known: [] };
  }

  const value = await resolvePersonFieldValue({
    appToken: PROJECT_APP_TOKEN,
    tableId: PROJECT_TABLE_ID,
    fieldName: PROJECT_FIELD.bd,
    input: ownerBd,
  });

  const known = await getKnownPersonNames({
    appToken: PROJECT_APP_TOKEN,
    tableId: PROJECT_TABLE_ID,
    fieldName: PROJECT_FIELD.bd,
  });

  return { value, known };
}
app.post("/api/customers", async (req, res) => {
  return withIdempotency(req, res, async () => {
  try {
    console.log("🟦 POST /api/customers body:", req.body);

    const appToken = process.env.FEISHU_BITABLE_APP_TOKEN;

    const tableId = process.env.FEISHU_BITABLE_TABLE_ID;



    if (!appToken || !tableId) {

      return res.status(500).json({

        success: false,

        error: "?缺少 FEISHU_BITABLE_APP_TOKEN ?FEISHU_BITABLE_TABLE_ID",

      });

    }



    const body = req.body || {};



    const shortName = String(body.shortName || body.name || "").trim();

    const companyName = String(body.companyName || "").trim();
    const leadMonth = String(body.leadMonth || "").trim();
    const leadMonthInfo = leadMonth
      ? await resolveFieldInfo(appToken, tableId, "线索月份")
      : null;



    if (!shortName) {

      return res.status(400).json({ success: false, error: "缺少 shortName / name" });

    }

    // 只写你飞书表里真实存在的字段名（UTF-8）
    const fields = {
      "客户/部门简称": shortName,
      "年框客户": Boolean(body.isAnnual),
    };

    if (companyName) fields["企业名称"] = companyName;
    if (leadMonth && leadMonthInfo) {
      const leadOption = resolveSelectOptionName(leadMonthInfo, leadMonth);
      const leadValue = toSelectValue(leadOption, leadMonthInfo.type);
      const hasValue = Array.isArray(leadValue) ? leadValue.length > 0 : Boolean(leadValue);
      if (hasValue) fields[leadMonthInfo.name] = leadValue;
    }

    const hq = String(body.hq || "").trim();
    if (hq) fields["公司总部地区"] = hq;

    const customerType = String(body.customerType || "").trim();
    if (customerType) fields["客户类型"] = customerType;

    const level = String(body.level || "").trim();
    if (level) fields["客户等级"] = level;

    const cooperationStatus = String(body.cooperationStatus || "").trim();
    if (cooperationStatus) fields["合作状态"] = cooperationStatus;

    const industry = String(body.industry || "").trim();
    if (industry) fields["行业大类"] = industry;

    // 人员字段（主BD负责人，type=11）：支持 user_id 或姓名（姓名将自动解析为 user_id）
    const ownerUserId = String(body.ownerUserId || "").trim();
    const ownerBd = String(body.ownerBd || "").trim();
    if (ownerUserId) {
      fields["主BD负责人"] = [{ id: ownerUserId }];
    } else if (ownerBd) {
      const { value: resolved, known } = await resolveCustomerBdField(ownerBd);
      if (!resolved) {
        return res.status(400).json({
          success: false,
          error: `无法解析人员字段 BD='${ownerBd}'（请确保该人员在飞书项目表里出现过一次，或配置 FEISHU_PERSON_ID_MAP）`,
          known_names: known,
        });
      }
      fields["主BD负责人"] = resolved;
    }

    console.log("🟦 POST /api/customers fields:", fields);



    const data = await batchCreateRecords({

      appToken,

      tableId,

      records: [{ fields }],

    });



    const recordId = data?.records?.[0]?.record_id;

    if (!recordId) {

      return res.status(500).json({

        success: false,

        error: "飞书返回异常：未生成 record_id",

        data,

      });

    }



    return res.json({

      success: true,

      record_id: recordId,

      target: { appToken, tableId },

      fields, // ?回传实际写入内容

    });

  } catch (e) {

    console.error("POST /api/customers failed:", e);

    return res.status(500).json({ success: false, error: String(e) });

  }
  });
});



// ====== 更新飞书客户表（客户ID不可变）======

app.put("/api/customers/:customerId", async (req, res) => {
  return withIdempotency(req, res, async () => {
  try {
    console.log("🟧 PUT /api/customers body:", req.body, "customerId=", req.params.customerId);

    const appToken = process.env.FEISHU_BITABLE_APP_TOKEN;

    const tableId = process.env.FEISHU_BITABLE_TABLE_ID;



    if (!appToken || !tableId) {

      return res.status(500).json({

        success: false,

        error: "❌缺?FEISHU_BITABLE_APP_TOKEN ?FEISHU_BITABLE_TABLE_ID",

      });

    }



    const customerId = String(req.params.customerId || "").trim();

    if (!customerId) {

      return res.status(400).json({ success: false, error: "缺少 customerId" });

    }



    // 1) resolve record_id（优先当?record_id；否则按字段「客户ID」匹配）

    let recordId = null;

    if (/^rec[a-zA-Z0-9]+$/.test(customerId)) {

      recordId = customerId;

    } else {

      const items = await listRecords({

        appToken,

        tableId,

        pageSize: 200,

      });

      const found = (items || []).find((it) => {

        const f = it?.fields || {};

        return String(f["客户ID"] || "").trim() === customerId;

      });

      recordId = found?.record_id || null;

    }



    if (!recordId) {

      return res.status(404).json({

        success: false,

        error: `未找到对应客户（customerId=${customerId}）`,

      });

    }



    // 2) build fields (DO NOT touch 客户ID)

    const body = req.body || {};
    const fieldInfoMap = await getFieldInfoMap(PROJECT_APP_TOKEN, PROJECT_TABLE_ID);

    const fields = {};



    const setIf = (fieldName, value) => {

      const isEmptyString = typeof value === "string" && value.trim() === "";

      if (value === undefined || value === null || isEmptyString) return;

      fields[fieldName] = value;

    };



    setIf("客户/部门简称", String(body.shortName || "").trim());

    setIf("企业名称", String(body.companyName || "").trim());
    const leadMonth = String(body.leadMonth || "").trim();
    if (leadMonth) {
      const leadMonthInfo = await resolveFieldInfo(appToken, tableId, "线索月份");
      const leadOption = resolveSelectOptionName(leadMonthInfo, leadMonth);
      const leadValue = toSelectValue(leadOption, leadMonthInfo.type);
      const hasValue = Array.isArray(leadValue) ? leadValue.length > 0 : Boolean(leadValue);
      if (hasValue) fields[leadMonthInfo.name] = leadValue;
    }

    setIf("公司总部地区", String(body.hq || "").trim());

    setIf("客户类型", body.customerType);

    setIf("客户等级", body.level);

    setIf("合作状态", body.cooperationStatus);

    setIf("行业大类", body.industry);

    if (body.isAnnual !== undefined) setIf("年框客户", Boolean(body.isAnnual));

    // 人员字段（主BD负责人，type=11）：支持 user_id 或姓名（姓名将自动解析为 user_id）
    const ownerUserId = String(body.ownerUserId || "").trim();

    const ownerBd = String(body.ownerBd || "").trim();

    if (ownerUserId) {

      fields["主BD负责人"] = [{ id: ownerUserId }];

    } else if (ownerBd) {

      const { value: resolved, known } = await resolveCustomerBdField(ownerBd);

      if (!resolved) {

        return res.status(400).json({

          success: false,

          error: `无法解析人员字段 BD='${ownerBd}'（请确保该人员在飞书项目表里出现过一次，或配置 FEISHU_PERSON_ID_MAP）`,

          known_names: known,

        });

      }

      fields["主BD负责人"] = resolved;

    }

    console.log("🟦 PUT /api/customers fields:", fields, "recordId=", recordId);



    const data = await updateRecord({

      appToken,

      tableId,

      recordId,

      fields,

    });



    return res.json({

      success: true,

      record_id: recordId,

      data,

      fields,

    });

  } catch (e) {

    console.error("PUT /api/customers/:customerId failed:", e);

    return res.status(500).json({ success: false, error: String(e) });

  }
  });
});





// ====== 关键：按 record_id 查回飞书确认是否写入成功 ======

app.get("/api/records/:recordId", async (req, res) => {

  try {

    const appToken = process.env.FEISHU_BITABLE_APP_TOKEN;

    const tableId = process.env.FEISHU_BITABLE_TABLE_ID;

    const recordId = req.params.recordId;



    if (!appToken || !tableId) {

      return res.status(500).json({ success: false, error: "missing env appToken/tableId" });

    }



    const data = await getRecordById({ appToken, tableId, recordId });

    res.json({ success: true, data });

  } catch (e) {

    console.error("GET /api/records/:recordId failed:", e);

    res.status(500).json({ success: false, error: String(e) });

  }

});



// ====== 列出表字段（用于确认字段名是否存在）======

app.get("/api/test-fields", async (req, res) => {

  try {

    const appToken = process.env.FEISHU_BITABLE_APP_TOKEN;

    const tableId = process.env.FEISHU_BITABLE_TABLE_ID;



    if (!appToken || !tableId) {

      return res.status(500).json({

        success: false,

        error: "missing env appToken/tableId",

      });

    }



    const items = await listFields({ appToken, tableId });



    const simple = (items || []).map((f) => ({

      field_id: f.field_id,

      field_name: f.field_name,

      type: f.type,

    }));



    res.json({ success: true, data: simple });

  } catch (e) {

    console.error("GET /api/test-fields failed:", e);

    res.status(500).json({ success: false, error: String(e) });

  }

});



// ====== 列出项目表字段（调试用）======

app.get("/api/test-project-fields", async (req, res) => {

  try {

    const appToken = PROJECT_APP_TOKEN;

    const tableId = PROJECT_TABLE_ID;



    if (!appToken || !tableId) {

      return res.status(500).json({

        success: false,

        error: "missing project appToken/tableId",

      });

    }



    const items = await listFields({ appToken, tableId });



    const simple = (items || []).map((f) => ({

      field_id: f.field_id,

      field_name: f.field_name,

      type: f.type,

    }));



    res.json({ success: true, data: simple });

  } catch (e) {

    console.error("GET /api/test-project-fields failed:", e);

    res.status(500).json({ success: false, error: String(e) });

  }

});



// ====== 项目表字段映?& helper ======

// 使用飞书表单里的显示名，避免空格/隐藏字符导致映射失败

const PROJECT_FIELD = {

  projectId: "项目ID",

  customerId: "客户ID",

  projectName: "项目名称",

  shortName: "客户/部门简称",

  campaignName: "活动&交付名称",

  platform: "平台",
  deliverableName: "平台",

  month: "所属年月",

  serviceType: "服务类型",

  projectType: "项目类别",

  stage: "项目进度",

  priority: "优先级",

  expectedAmount: "预估项目金额",

  bd: "BD",

  am: "AM",

  totalBdHours: "累计商务时间（hr）",

  lastUpdateDate: "最新更新日期",

  isFollowedUp: "是否已跟进",

  daysSinceUpdate: "距上次更新天数",

  createdAt: "创建时间",

};




function mapProjectRecord(it = {}) {

  const f = it.fields || {};

  const pickSingle = (v) => {

    if (Array.isArray(v)) return pickSingle(v[0]);

    if (typeof v === "object" && v !== null) {

      return (

        v?.name ??

        v?.text ??

        v?.label ??

        v?.value ??

        v?.option_name ??

        ""

      );

    }

    return v ?? "";

  };

  const pickNumber = (v) => {

    if (Array.isArray(v)) return pickNumber(v[0]);

    if (typeof v === "object" && v !== null) {

      const num = Number(v?.value ?? v?.text ?? v?.name ?? v);

      return Number.isNaN(num) ? 0 : num;

    }

    const num = Number(v);

    return Number.isNaN(num) ? 0 : num;

  };
  const pickBoolean = (v) => {
    if (Array.isArray(v)) return pickBoolean(v[0]);
    if (typeof v === "object" && v !== null) {
      return pickBoolean(v?.value ?? v?.text ?? v?.name ?? v?.label ?? v?.option_name ?? v);
    }
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return v !== 0;
    const s = String(v ?? "").trim();
    if (!s) return false;
    return s === "是" || s.toLowerCase() === "true" || s === "1" || s === "已跟进";
  };



  const normalizeAny = (v) => {

    if (Array.isArray(v)) {

      const arr = v.map((item) => pickSingle(item)).filter(Boolean);

      return arr.join("?");

    }

    if (typeof v === "object" && v !== null) {

      return pickSingle(v);

    }

    return v ?? "";

  };



  const formatDate = (v) => {
    if (v === null || v === undefined) return "";
    const str = String(v).trim();
    if (!str || str === "0") return "";

    const pad2 = (n) => String(n).padStart(2, "0");
    const formatLocal = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    const formatUtc = (d) => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;

    const num = Number(str);
    const isNum = !Number.isNaN(num);
    if (isNum) {
      // 只在可能是时间戳时再转，避免普通数字被误判
      const isMs = str.length >= 13 || num > 1e11;
      const isSec = str.length === 10 || (num >= 1e9 && num < 2e10);
      // Feishu 日期字段有时会以 Excel 序列号返回（天数），需特殊处理
      const isExcelSerial = num > 20000 && num < 60000; // roughly 1955-2070

      if (isMs || isSec) {
        const d = new Date(isMs ? num : num * 1000);
        if (!Number.isNaN(d.getTime())) return formatLocal(d);
      }

      if (isExcelSerial) {
        const base = Date.UTC(1899, 11, 30); // Excel 序列号起点（含 1900 闰年 bug 补偿）
        const d = new Date(base + num * 24 * 60 * 60 * 1000);
        if (!Number.isNaN(d.getTime())) return formatUtc(d);
      }

      // 小数字直接原样返回，避免误判
      return str;
    }

    if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(str)) {
      const [y, m, d] = str.replace(/\//g, "-").split("-");
      return `${y}-${pad2(m)}-${pad2(d)}`;
    }

    return str;
  };

  const rawIsFollowedUp = f[PROJECT_FIELD.isFollowedUp] ?? f.isFollowedUp;
  const rawDaysSinceUpdate = f[PROJECT_FIELD.daysSinceUpdate] ?? f.daysSinceUpdate;
  const isFollowedUp =
    rawIsFollowedUp === undefined || rawIsFollowedUp === null || rawIsFollowedUp === ""
      ? undefined
      : pickBoolean(rawIsFollowedUp);
  const daysSinceUpdate =
    rawDaysSinceUpdate === undefined || rawDaysSinceUpdate === null || rawDaysSinceUpdate === ""
      ? undefined
      : pickNumber(rawDaysSinceUpdate);

  const rawCampaignName =
    f[PROJECT_FIELD.campaignName] ||
    f["活动名称"] ||
    f.campaignName ||
    "";

  const rawPlatform =
    f[PROJECT_FIELD.platform] ||
    f["平台"] ||
    f["交付名称"] ||
    f.platform ||
    f.deliverableName ||
    "";

  const result = {

    projectId:

      f[PROJECT_FIELD.projectId] ||

      f.projectId ||

      f.id ||

      it.record_id ||

      "",

    customerId: f[PROJECT_FIELD.customerId] || f.customerId || "",

    shortName: f[PROJECT_FIELD.shortName] || f.shortName || "",

    projectName: f[PROJECT_FIELD.projectName] || f.projectName || "",

    serviceType: pickSingle(f[PROJECT_FIELD.serviceType] || f.serviceType),

    projectType: pickSingle(f[PROJECT_FIELD.projectType] || f.projectType),

    stage: pickSingle(f[PROJECT_FIELD.stage] || f.stage),

    priority: pickSingle(f[PROJECT_FIELD.priority] || f.priority),

    bd: pickSingle(f[PROJECT_FIELD.bd] || f.bd),

    am: pickSingle(f[PROJECT_FIELD.am] || f.am),

    month: f[PROJECT_FIELD.month] || f["所属月份"] || f.month || "",

    campaignName: rawCampaignName,
    platform: rawPlatform,
    deliverableName: rawPlatform,

    expectedAmount: pickNumber(f[PROJECT_FIELD.expectedAmount] || f.expectedAmount),

    totalBdHours: pickNumber(f[PROJECT_FIELD.totalBdHours] || f.totalBdHours),

    isFollowedUp,

    daysSinceUpdate,

    createdAt:
      f[PROJECT_FIELD.createdAt] ||
      f["记录创建时间"] ||
      f["创建日期"] ||
      f.createdAt ||
      it.created_time ||
      "",

    lastUpdateDate:
      f[PROJECT_FIELD.lastUpdateDate] ||
      f["最近更新日期"] ||
      f["最新更新日期"] ||
      f.lastUpdateDate ||
      "",

  };



  Object.keys(result).forEach((k) => {

    const v = result[k];

    if (k === "expectedAmount" || k === "totalBdHours" || k === "daysSinceUpdate" || k === "isFollowedUp") {
      return;
    }

    if (k === "lastUpdateDate" || k === "createdAt") {
      const normalized = normalizeAny(v);
      result[k] = formatDate(normalized);
    } else {
      result[k] = normalizeAny(v);
    }

  });

  return result;

}



async function findProjectRecordIdByProjectId(projectId) {
  const target = String(projectId || "").trim();
  if (!target) return null;
  if (looksLikeRecordId(target)) return target;
  let pageToken = "";
  for (;;) {
    const { items, hasMore, pageToken: nextToken } = await listRecordsWithMeta({
      appToken: PROJECT_APP_TOKEN,
      tableId: PROJECT_TABLE_ID,
      pageSize: 200,
      pageToken,
    });
    const hit = (items || []).find((it) => {
      const f = it.fields || {};
      const val =
        f[PROJECT_FIELD.projectId] ||
        f.projectId ||
        f.id ||
        it.record_id ||
        "";
      return String(val).trim() === target;
    });
    if (hit) return hit.record_id || null;
    if (!hasMore || !nextToken) break;
    pageToken = nextToken;
  }
  return null;

}



// ====== 读取项目 ======

app.get("/api/projects", async (req, res) => {

  try {

    if (!PROJECT_APP_TOKEN || !PROJECT_TABLE_ID) {

      return res.status(500).json({

        success: false,

        error: "missing project appToken/tableId",

      });

    }



    const keyword = (req.query.keyword || "").toString().trim().toLowerCase();

    const customerId = (req.query.customerId || "").toString().trim();



    const projectsAll = await withCache("projects:all", API_CACHE_TTL_MS, async () => {
      const records = [];
      let pageToken = "";
      for (;;) {
        const { items, hasMore, pageToken: nextToken } = await listRecordsWithMeta({
          appToken: PROJECT_APP_TOKEN,
          tableId: PROJECT_TABLE_ID,
          pageSize: 200,
          pageToken,
        });
        records.push(...(items || []));
        if (!hasMore || !nextToken) break;
        pageToken = nextToken;
      }
      return (records || []).map((it) => mapProjectRecord(it));
    });

    let projects = projectsAll || [];



    if (keyword) {

      projects = projects.filter(

        (p) =>

          (p.projectName || "").toLowerCase().includes(keyword) ||

          (p.shortName || "").toLowerCase().includes(keyword)

      );

    }



    if (customerId) {

      projects = projects.filter((p) => String(p.customerId || "") === customerId);

    }



    res.json({ success: true, data: projects });

  } catch (e) {

    console.error("GET /api/projects failed:", e);

    res.status(500).json({ success: false, error: String(e) });

  }

});



app.get("/api/projects/:projectId", async (req, res) => {

  try {

    const projectId = req.params.projectId;

    if (!PROJECT_APP_TOKEN || !PROJECT_TABLE_ID) {

      return res.status(500).json({

        success: false,

        error: "missing project appToken/tableId",

      });

    }



    const recordId = await findProjectRecordIdByProjectId(projectId);

    if (!recordId) {

      return res.status(404).json({ success: false, error: "project not found" });

    }



    const items = await listRecords({

      appToken: PROJECT_APP_TOKEN,

      tableId: PROJECT_TABLE_ID,

      pageSize: 200,

    });

    const hit = (items || []).find((it) => it.record_id === recordId);

    if (!hit) {

      return res.status(404).json({ success: false, error: "project not found" });

    }



    res.json({ success: true, data: mapProjectRecord(hit) });

  } catch (e) {

    console.error("GET /api/projects/:projectId failed:", e);

    res.status(500).json({ success: false, error: String(e) });

  }

});



// ====== 写入/更新项目 ======

app.post("/api/projects", async (req, res) => {
  return withIdempotency(req, res, async () => {
  try {

    if (!PROJECT_APP_TOKEN || !PROJECT_TABLE_ID) {

      return res.status(500).json({

        success: false,

        error: "缺少项目?appToken/tableId",

      });

    }



    const body = req.body || {};
    const fieldInfoMap = await getFieldInfoMap(PROJECT_APP_TOKEN, PROJECT_TABLE_ID);

    const projectName = String(body.projectName || "").trim();

    if (!projectName) {

      return res.status(400).json({ success: false, error: "缺少 projectName" });

    }



    const fields = {};

    const warnings = [];

    const setField = (key, value) => {
      const fieldName = PROJECT_FIELD[key];
      if (fieldName && isReadonlyField(fieldInfoMap, fieldName)) return;

      const isEmptyString = typeof value === "string" && value.trim() === "";

      if (value === undefined || value === null || isEmptyString) return;

      fields[fieldName] = value;

    };

    const setSelectField = (key, value) => {
      const fieldName = PROJECT_FIELD[key];
      if (!fieldName) return;
      const isEmptyString = typeof value === "string" && value.trim() === "";
      if (value === undefined || value === null || isEmptyString) return;
      const info = fieldInfoMap?.get(normalizeFieldName(fieldName));
      if (info) {
        const optionName = resolveSelectOptionName(info, value);
        const selectValue = toSelectValue(optionName, info.type);
        return setField(key, selectValue);
      }
      return setField(key, value);
    };

    const normalizeFollowUpValue = (value) => {
      if (value === true || value === false) return value;
      const raw = String(value ?? "").trim();
      if (!raw) return undefined;
      const lower = raw.toLowerCase();
      if (["是", "true", "1", "yes", "y"].includes(lower)) return true;
      if (["否", "false", "0", "no", "n"].includes(lower)) return false;
      return undefined;
    };



    setField("projectName", projectName);

    setField("projectId", String(body.projectId || "").trim());

    setField("customerId", String(body.customerId || "").trim());

    setField("shortName", String(body.shortName || "").trim());

    setField("serviceType", body.serviceType);

    setField("projectType", body.projectType);

    setField("stage", body.stage);

    setField("priority", body.priority);

    setField("month", body.month);

    setField("campaignName", body.campaignName);

    const platformValue = body.platform ?? body.deliverableName;
    setSelectField("platform", platformValue);

    setField("totalBdHours", body.totalBdHours);

    setField("lastUpdateDate", body.lastUpdateDate);

    setField("isFollowedUp", normalizeFollowUpValue(body.isFollowedUp));

    if (body.expectedAmount !== undefined && body.expectedAmount !== null && body.expectedAmount !== "") {

      const num = Number(body.expectedAmount);

      if (!Number.isNaN(num)) setField("expectedAmount", num);

    }



    // ⚠️ 人员字段（BD/AM）：飞书需?list<object>，这里支持前端传“姓名字符串”并在项目表内自动解析成 id?
    if (body.bd !== undefined && body.bd !== null && String(body.bd).trim() !== "") {

      const v = await resolvePersonFieldValue({

        appToken: PROJECT_APP_TOKEN,

        tableId: PROJECT_TABLE_ID,

        fieldName: PROJECT_FIELD.bd,

        input: body.bd,

      });

      if (!v) {

        const known = await getKnownPersonNames({

          appToken: PROJECT_APP_TOKEN,

          tableId: PROJECT_TABLE_ID,

          fieldName: PROJECT_FIELD.bd,

        });

        return res.status(400).json({

          success: false,

          error: `无法解析人员字段 BD='${String(body.bd)}'（请确保该人员在飞书表里出现过一次，或配?FEISHU_PERSON_ID_MAP）`,

          known_names: known,

        });

      }

      fields[PROJECT_FIELD.bd] = v;

    }



    if (body.am !== undefined && body.am !== null && String(body.am).trim() !== "") {

      const v = await resolvePersonFieldValue({

        appToken: PROJECT_APP_TOKEN,

        tableId: PROJECT_TABLE_ID,

        fieldName: PROJECT_FIELD.am,

        input: body.am,

      });

      if (!v) {

        const known = await getKnownPersonNames({

          appToken: PROJECT_APP_TOKEN,

          tableId: PROJECT_TABLE_ID,

          fieldName: PROJECT_FIELD.am,

        });

        warnings.push(

          `无法解析人员字段 AM='${String(body.am)}'（请确保该人员在飞书表里出现过一次，或配?FEISHU_PERSON_ID_MAP）；已忽略该字段以避免写入失败。`

        );

        console.warn("POST /api/projects warning:", warnings[warnings.length - 1], {

          known_names: known,

        });

      } else {

        fields[PROJECT_FIELD.am] = v;

      }

    }



    console.log("🦆 POST /api/projects fields:", fields);



    const data = await batchCreateRecords({

      appToken: PROJECT_APP_TOKEN,

      tableId: PROJECT_TABLE_ID,

      records: [{ fields }],

    });



    const recordId = data?.records?.[0]?.record_id;

    if (!recordId) {

      return res.status(500).json({

        success: false,

        error: "飞书返回异常：未生成 record_id",

        data,

      });

    }

    apiCache.delete("projects:all");



    res.json({

      success: true,

      record_id: recordId,

      target: { appToken: PROJECT_APP_TOKEN, tableId: PROJECT_TABLE_ID },

      fields,

      warnings,

    });

  } catch (e) {

    console.error("POST /api/projects failed:", e);

    res.status(500).json({ success: false, error: String(e) });

  }
  });
});



app.put("/api/projects/:projectId", async (req, res) => {
  return withIdempotency(req, res, async () => {
  try {

    if (!PROJECT_APP_TOKEN || !PROJECT_TABLE_ID) {

      return res.status(500).json({

        success: false,

        error: "缺少项目?appToken/tableId",

      });

    }

    const projectId = req.params.projectId;

    const recordId = await findProjectRecordIdByProjectId(projectId);

    if (!recordId) {

      return res.status(404).json({ success: false, error: "project not found" });

    }



    const body = req.body || {};
    const fieldInfoMap = await getFieldInfoMap(PROJECT_APP_TOKEN, PROJECT_TABLE_ID);

    const fields = {};

    const warnings = [];

    const setField = (key, value) => {
      const fieldName = PROJECT_FIELD[key];
      if (fieldName && isReadonlyField(fieldInfoMap, fieldName)) return;

      const isEmptyString = typeof value === "string" && value.trim() === "";

      if (value === undefined || value === null || isEmptyString) return;

      fields[fieldName] = value;

    };

    const setSelectField = (key, value) => {
      const fieldName = PROJECT_FIELD[key];
      if (!fieldName) return;
      const isEmptyString = typeof value === "string" && value.trim() === "";
      if (value === undefined || value === null || isEmptyString) return;
      const info = fieldInfoMap?.get(normalizeFieldName(fieldName));
      if (info) {
        const optionName = resolveSelectOptionName(info, value);
        const selectValue = toSelectValue(optionName, info.type);
        return setField(key, selectValue);
      }
      return setField(key, value);
    };



    setField("projectName", String(body.projectName || "").trim());

    setField("customerId", String(body.customerId || "").trim());

    setField("shortName", String(body.shortName || "").trim());

    setField("serviceType", body.serviceType);

    setField("projectType", body.projectType);

    setField("stage", body.stage);

    setField("priority", body.priority);

    setField("month", body.month);

    setField("campaignName", body.campaignName);

    const platformValue = body.platform ?? body.deliverableName;
    setSelectField("platform", platformValue);

    setField("totalBdHours", body.totalBdHours);

    setField("lastUpdateDate", body.lastUpdateDate);

    setField("isFollowedUp", body.isFollowedUp);

    if (body.expectedAmount !== undefined && body.expectedAmount !== null && body.expectedAmount !== "") {

      const num = Number(body.expectedAmount);

      if (!Number.isNaN(num)) setField("expectedAmount", num);

    }



    // ⚠️ 人员字段（BD/AM）：飞书需?list<object>，这里支持前端传“姓名字符串”并在项目表内自动解析成 id?
    if (body.bd !== undefined && body.bd !== null && String(body.bd).trim() !== "") {

      const v = await resolvePersonFieldValue({

        appToken: PROJECT_APP_TOKEN,

        tableId: PROJECT_TABLE_ID,

        fieldName: PROJECT_FIELD.bd,

        input: body.bd,

      });

      if (!v) {

        return res.status(400).json({

          success: false,

          error: `无法解析人员字段 BD='${String(body.bd)}'（请确保该人员在飞书表里出现过一次，或配?FEISHU_PERSON_ID_MAP）`,

        });

      }

      fields[PROJECT_FIELD.bd] = v;

    }



    if (body.am !== undefined && body.am !== null && String(body.am).trim() !== "") {

      const v = await resolvePersonFieldValue({

        appToken: PROJECT_APP_TOKEN,

        tableId: PROJECT_TABLE_ID,

        fieldName: PROJECT_FIELD.am,

        input: body.am,

      });

      if (!v) {

        warnings.push(

          `无法解析人员字段 AM='${String(body.am)}'（请确保该人员在飞书表里出现过一次，或配?FEISHU_PERSON_ID_MAP）；已忽略该字段以避免更新失败。`

        );

        console.warn("PUT /api/projects warning:", warnings[warnings.length - 1]);

      } else {

        fields[PROJECT_FIELD.am] = v;

      }

    }



    console.log("🦆 PUT /api/projects fields:", fields);



    const data = await updateRecord({

      appToken: PROJECT_APP_TOKEN,

      tableId: PROJECT_TABLE_ID,

      recordId,

      fields,

    });

    apiCache.delete("projects:all");



    res.json({

      success: true,

      record_id: recordId,

      data,

      fields,

      warnings,

    });

  } catch (e) {

    console.error("PUT /api/projects/:projectId failed:", e);

    res.status(500).json({ success: false, error: String(e) });

  }
  });
});





// ====== 立项（Deals）======

const formatDateLoose = (v) => {

  if (v === null || v === undefined) return "";

  const str = String(v).trim();

  if (!str || str === "0") return "";

  const pad2 = (n) => String(n).padStart(2, "0");
  const formatLocal = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const formatUtc = (d) => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;

  const num = Number(str);
  const isNum = !Number.isNaN(num);

  if (isNum) {

    const isMs = str.length >= 13 || num > 1e11;

    const isSec = str.length === 10 || (num >= 1e9 && num < 2e10);

    const isExcelSerial = num > 20000 && num < 60000;

    if (isMs || isSec) {

      const d = new Date(isMs ? num : num * 1000);

      if (!Number.isNaN(d.getTime())) return formatLocal(d);

    }

    if (isExcelSerial) {

      const base = Date.UTC(1899, 11, 30);
      const d = new Date(base + num * 24 * 60 * 60 * 1000);

      if (!Number.isNaN(d.getTime())) return formatUtc(d);

    }

    return str;

  }

  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(str)) {

    const [y, m, d] = str.replace(/\//g, "-").split("-");
    return `${y}-${pad2(m)}-${pad2(d)}`;

  }

  return str;
};

const DEAL_FIELD = {
  serialNo: "立项编号",
  dealId: "立项ID",
  projectId: "项目ID",
  customerId: "客户ID",
  month: "所属月份",
  projectName: "项目名称",
  startDate: "项目开始时间",
  endDate: "项目结束时间",
  belong: "归属",
  isFinished: "是否完结",
  signCompany: "签约公司主体",
  contractEntity: "合同主体",
  incomeWithTax: "含税收入",
  incomeWithoutTax: "不含税收入",
  estimatedCost: "预估成本",
  paidThirdPartyCost: "已付项目成本【三方】",
  receivedAmount: "已收金额",
  remainingReceivable: "剩余应收金额",
  firstPaymentDate: "预计下一次到款时间",
  finalPaymentDate: "全款实际到款时间",
  grossProfit: "毛利",
  grossMargin: "毛利率",
  lastUpdateDate: "最后更新时间",
  createdAt: "创建时间",
};

function mapDealRecord(it = {}) {
  const f = it.fields || {};
  const pickSingle = (v) => {
    if (Array.isArray(v)) return pickSingle(v[0]);
    if (typeof v === "object" && v !== null) {
      return v?.name ?? v?.text ?? v?.label ?? v?.value ?? v?.option_name ?? "";
    }
    return v ?? "";
  };

  const pickFieldByIncludes = (fields, keywords) => {
    const keys = Object.keys(fields || {});
    for (const key of keys) {
      const hit = keywords.every((word) => String(key).includes(word));
      if (hit) return fields[key];
    }
    return undefined;
  };

  const pickFieldByKeywordSets = (fields, keywordSets) => {
    for (const keywords of keywordSets) {
      const hit = pickFieldByIncludes(fields, keywords);
      if (hit !== undefined) return hit;
    }
    return undefined;
  };

  const normalizeNumber = (raw) => {
    if (raw === null || raw === undefined || raw === "") return null;
    if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
    const str = String(raw).replace(/[,\s¥￥]/g, "").trim();
    if (!str) return null;
    const num = Number(str);
    return Number.isNaN(num) ? null : num;
  };

  const pickNumber = (v) => {
    if (v === null || v === undefined || v === "") return null;
    if (Array.isArray(v)) return pickNumber(v[0]);
    if (typeof v === "object" && v !== null) {
      const raw = v?.value ?? v?.amount ?? v?.number ?? v?.text ?? v?.name ?? v;
      return normalizeNumber(raw);
    }
    return normalizeNumber(v);
  };

  const normalizeAny = (v) => {
    if (Array.isArray(v)) {
      const arr = v.map((item) => pickSingle(item)).filter(Boolean);
      return arr.join(", ");
    }
    if (typeof v === "object" && v !== null) {
      return pickSingle(v);
    }
    return v ?? "";
  };

  const result = {
    recordId: it.record_id || "",
    serialNo: f[DEAL_FIELD.serialNo] || f.serialNo || "",
    primaryNo: f["编号"] || "",
    dealId: f[DEAL_FIELD.dealId] || f.dealId || it.record_id || "",
    projectId: f[DEAL_FIELD.projectId] || f.projectId || "",
    customerId: f[DEAL_FIELD.customerId] || f.customerId || "",
    month: f[DEAL_FIELD.month] || f["所属年月"] || f.month || "",
    projectName: f[DEAL_FIELD.projectName] || f.projectName || "",
    startDate: f[DEAL_FIELD.startDate] || f["项目开始日期"] || f.startDate || "",
    endDate: f[DEAL_FIELD.endDate] || f["项目结束日期"] || f.endDate || "",
    belong: f[DEAL_FIELD.belong] || f["归属"] || f.belong || "",
    isFinished: f[DEAL_FIELD.isFinished] ?? f.isFinished ?? "",
    signCompany: f[DEAL_FIELD.signCompany] || f.signCompany || "",
    contractEntity: f[DEAL_FIELD.contractEntity] || f.contractEntity || "",
    incomeWithTax: pickNumber(f[DEAL_FIELD.incomeWithTax] || f.incomeWithTax),
    incomeWithoutTax: pickNumber(f[DEAL_FIELD.incomeWithoutTax] || f.incomeWithoutTax),
    estimatedCost: pickNumber(f[DEAL_FIELD.estimatedCost] || f.estimatedCost),
    paidThirdPartyCost: pickNumber(
      f[DEAL_FIELD.paidThirdPartyCost] ||
      f["已付三方成本"] ||
      f["已付项目成本（三方）"] ||
      f["已付项目成本(三方)"] ||
      f["已付项目成本（第三方）"] ||
      pickFieldByIncludes(f, ["已付", "项目成本"]) ||
      f.paidThirdPartyCost
    ),
    receivedAmount: pickNumber(f[DEAL_FIELD.receivedAmount] || f.receivedAmount),
    remainingReceivable: pickNumber(f[DEAL_FIELD.remainingReceivable] || f.remainingReceivable),
    firstPaymentDate:
      f[DEAL_FIELD.firstPaymentDate] ||
      f["预计下一次到款日期"] ||
      f["预计下次到款时间"] ||
      f["预计下次到款日期"] ||
      f["预计首款时间"] ||
      f["预计首款日期"] ||
      pickFieldByKeywordSets(f, [["预计", "到款", "次"], ["预计", "到款", "首"]]) ||
      f.firstPaymentDate ||
      "",
    finalPaymentDate:
      f[DEAL_FIELD.finalPaymentDate] ||
      f["全款实际到款日期"] ||
      f["实际到款时间"] ||
      f["实际到款日期"] ||
      f["预计尾款时间"] ||
      f["预计尾款日期"] ||
      pickFieldByKeywordSets(f, [["全款", "到款"], ["尾款", "到款"]]) ||
      f.finalPaymentDate ||
      "",
    grossProfit: pickNumber(f[DEAL_FIELD.grossProfit] || f.grossProfit),
    grossMargin: pickNumber(f[DEAL_FIELD.grossMargin] || f.grossMargin),
    lastUpdateDate: f[DEAL_FIELD.lastUpdateDate] || f.lastUpdateDate || "",
    createdAt:
      f["立项创建时间"] ||
      f["立项创建日期"] ||
      f[DEAL_FIELD.createdAt] ||
      f["创建时间"] ||
      f["创建日期"] ||
      f.createdAt ||
      it.created_time ||
      "",
  };

  Object.keys(result).forEach((k) => {
    const v = result[k];
    if (
      k === "startDate" ||
      k === "endDate" ||
      k === "firstPaymentDate" ||
      k === "finalPaymentDate" ||
      k === "lastUpdateDate" ||
      k === "createdAt"
    ) {
      const normalized = normalizeAny(v);
      result[k] = formatDateLoose(normalized);
    } else if (k === "incomeWithTax" || k === "incomeWithoutTax" || k === "estimatedCost" || k === "paidThirdPartyCost" || k === "receivedAmount" || k === "remainingReceivable" || k === "grossProfit" || k === "grossMargin") {
      // already normalized
    } else {
      result[k] = normalizeAny(v);
    }
  });

  result.isFinished = normalizeAny(result.isFinished);
  return result;
}


async function findDealRecordIdByDealId(dealId) {
  const target = String(dealId || "").trim();
  if (!target) return null;
  if (looksLikeRecordId(target)) return target;
  let pageToken = "";
  for (;;) {
    const { items, hasMore, pageToken: nextToken } = await listRecordsWithMeta({
      appToken: DEAL_APP_TOKEN,
      tableId: DEAL_TABLE_ID,
      pageSize: 200,
      pageToken,
    });
    const hit = (items || []).find((it) => {
      const f = it.fields || {};
      const val = String(
        f[DEAL_FIELD.dealId] ||
          f.dealId ||
          f.id ||
          it.record_id ||
          ""
      ).trim();
      return val && val === target;
    });
    if (hit) return hit.record_id || null;
    if (!hasMore || !nextToken) break;
    pageToken = nextToken;
  }
  return null;
}

async function resolveDealRecordIdByAny(value) {
  const key = String(value || "").trim();
  if (!key) return null;
  if (looksLikeRecordId(key)) return key;
  let pageToken = "";
  for (;;) {
    const { items, hasMore, pageToken: nextToken } = await listRecordsWithMeta({
      appToken: DEAL_APP_TOKEN,
      tableId: DEAL_TABLE_ID,
      pageSize: 200,
      pageToken,
    });
    const hit = (items || []).find((it) => {
      const f = it.fields || {};
    const dealId = String(f[DEAL_FIELD.dealId] || f.dealId || f.id || "").trim();
    const serialNo = String(f[DEAL_FIELD.serialNo] || f.serialNo || "").trim();
    const primaryNo = String(f["编号"] || "").trim();
    return (
      (dealId && dealId === key) ||
      (serialNo && serialNo === key) ||
      (primaryNo && primaryNo === key)
    );
  });
    if (hit) return hit.record_id || null;
    if (!hasMore || !nextToken) break;
    pageToken = nextToken;
  }
  return null;
}
app.get("/api/deals", async (req, res) => {

  try {

    if (!DEAL_APP_TOKEN || !DEAL_TABLE_ID) {

      return res.status(500).json({

        success: false,

        error:

          "missing deal appToken/tableId (FEISHU_DEAL_APP_TOKEN/FEISHU_BITABLE_DEAL_TABLE_ID)",

      });

    }



    const keyword = (req.query.keyword || "").toString().trim().toLowerCase();

    const projectId = (req.query.projectId || "").toString().trim();



    const dealsAll = await withCache("deals:all", API_CACHE_TTL_MS, async () => {
      const records = await listRecords({
        appToken: DEAL_APP_TOKEN,
        tableId: DEAL_TABLE_ID,
        pageSize: 200,
      });
      return (records || []).map((it) => mapDealRecord(it));
    });

    let deals = dealsAll || [];



    if (keyword) {

      deals = deals.filter((d) =>

        (d.projectName || "").toLowerCase().includes(keyword)

      );

    }



    if (projectId) {

      deals = deals.filter((d) => String(d.projectId || "") === projectId);

    }



    res.json({ success: true, data: deals });

  } catch (e) {

    console.error("GET /api/deals failed:", e);

    res.status(500).json({ success: false, error: String(e) });

  }

});



app.post("/api/deals", async (req, res) => {
  return withIdempotency(req, res, async () => {
  try {

    if (!DEAL_APP_TOKEN || !DEAL_TABLE_ID) {

      return res.status(500).json({

        success: false,

        error:

          "missing deal appToken/tableId (FEISHU_DEAL_APP_TOKEN/FEISHU_BITABLE_DEAL_TABLE_ID)",

      });

    }



    const body = req.body || {};

    const dealId = String(body.dealId || "").trim();

    const projectId = String(body.projectId || "").trim(); // 兼容旧表单：如果表里没有字段，会自动忽略

    const customerId = String(body.customerId || "").trim();



    if (!dealId)

      return res.status(400).json({ success: false, error: "missing dealId" });



    const fields = {};

    const normalizeMonth = (v) => {

      const s = String(v ?? "").trim();

      if (!s) return undefined;

      const m = s.match(/(?:^|\.)(\d{1,2})$/); // 取末尾的月份数字

      const n = Number(m ? m[1] : s);

      return Number.isFinite(n) ? n : s;

    };



    const toUnixTs = (v) => {

      if (v === undefined || v === null) return undefined;

      if (typeof v === "number" && Number.isFinite(v)) return v < 1e11 ? v * 1000 : v;

      const s = String(v).trim();

      if (!s) return undefined;

      if (/^\d+$/.test(s)) {

        const num = Number(s);

        if (!Number.isFinite(num)) return undefined;

        return num < 1e11 ? num * 1000 : num;

      }

      const d = new Date(s.replace(/\//g, "-"));

      if (Number.isNaN(d.getTime())) return undefined;

      return d.getTime();

    };



    const items = await listFields({ appToken: DEAL_APP_TOKEN, tableId: DEAL_TABLE_ID });

    const fieldNames = new Set((items || []).map((f) => f.field_name));
    const fieldInfoMap = new Map();
    (items || []).forEach((f) => {
      if (!f?.field_name) return;
      fieldInfoMap.set(normalizeFieldName(f.field_name), {
        name: f.field_name,
        type: f.type,
        options: Array.isArray(f?.property?.options) ? f.property.options : [],
      });
    });

    const warnings = [];

    const findFieldName = (name) => {
      if (fieldNames.has(name)) return name;
      const matched = Array.from(fieldNames).find((n) => String(n).includes(name));
      return matched || null;
    };

    const toBoolMaybe = (value) => {
      if (value === true || value === false) return value;
      const s = String(value ?? "").trim().toLowerCase();
      if (!s) return null;
      if (["是", "true", "1", "yes", "y"].includes(s)) return true;
      if (["否", "false", "0", "no", "n"].includes(s)) return false;
      return null;
    };

    const toYesNoMaybe = (value) => {
      if (value === true) return "是";
      if (value === false) return "否";
      return null;
    };
    

    const setIf = (name, value) => {

      const isEmptyString = typeof value === "string" && value.trim() === "";

      if (value === undefined || value === null || isEmptyString) return;

      if (!fieldNames.has(name)) {

        warnings.push(`field not found: ${name}`);

        return;

      }

      fields[name] = value;

    };

    const setIfAlias = (names, value) => {
      const isEmptyString = typeof value === "string" && value.trim() === "";
      if (value === undefined || value === null || isEmptyString) return;
      const target =
        names
          .map((name) => (fieldNames.has(name) ? name : findFieldName(name)))
          .find(Boolean) || null;
      if (!target) {
        warnings.push(`field not found: ${names[0]}`);
        return;
      }
      fields[target] = value;
    };

    setIf("立项ID", dealId);

    // 如果立项表没有“项目ID/项目名称”字段，以下两行会被忽略，不会写?
    setIf("项目ID", projectId);

    setIf("客户ID", customerId);

    // setIf("项目名称", String(body.projectName || "").trim());

    const monthVal = normalizeMonth(body.month);

    if (monthVal !== undefined) {
      setIf("所属月份", monthVal);
      setIf("所属年月", monthVal);
    }

    setIf("项目开始时间", toUnixTs(body.startDate));
    setIf("项目开始日期", toUnixTs(body.startDate));

    setIf("项目结束时间", toUnixTs(body.endDate));
    setIf("归属", body.belong);

    const finishedFieldName = findFieldName("是否完结");
    if (finishedFieldName) {
      const finishedValue = normalizeFinishedValue(body.isFinished);
      if (finishedValue) {
        setSelectField(finishedFieldName, finishedValue);
      }
    } else if (body.isFinished !== undefined && body.isFinished !== null) {
      warnings.push("field not found: 是否完结");
    }

    setIf("签约公司主体", body.signCompany);



    if (body.incomeWithTax !== undefined && body.incomeWithTax !== "")

      setIf("含税收入", Number(body.incomeWithTax));

    if (body.incomeWithoutTax !== undefined && body.incomeWithoutTax !== "")
      setIf("不含税收入", Number(body.incomeWithoutTax));

    if (body.estimatedCost !== undefined && body.estimatedCost !== "")

      setIf("预估成本", Number(body.estimatedCost));

    if (body.paidThirdPartyCost !== undefined && body.paidThirdPartyCost !== "") {
      const num = Number(body.paidThirdPartyCost);
      if (Number.isFinite(num)) {
        setIfAlias(
          ["已付项目成本【三方】", "已付项目成本（三方）", "已付项目成本(三方)", "已付三方成本"],
          num
        );
      }
    }

    if (body.receivedAmount !== undefined && body.receivedAmount !== "")

      setIf("已收金额", Number(body.receivedAmount));



    if (body.thirdPartyCost !== undefined && body.thirdPartyCost !== "") {
      const num = Number(body.thirdPartyCost);
      if (Number.isFinite(num)) {
        setIfAlias(
          ["已付项目成本【三方】", "已付项目成本（三方）", "已付项目成本(三方)", "已付三方成本"],
          num
        );
      }
    }

    if (body.grossProfit !== undefined && body.grossProfit !== "")

      setIf("毛利", Number(body.grossProfit));

    if (body.grossMargin !== undefined && body.grossMargin !== "")
      setIf("毛利率", Number(body.grossMargin));

    if (body.remainingReceivable !== undefined && body.remainingReceivable !== "")

      setIf("剩余应收金额", Number(body.remainingReceivable));



    setIfAlias(
      ["预计下一次到款时间", "预计下一次到款日期", "预计下次到款时间", "预计下次到款日期", "预计首款时间", "预计首款日期"],
      toUnixTs(body.firstPaymentDate)
    );

    setIfAlias(
      ["全款实际到款时间", "全款实际到款日期", "实际到款时间", "实际到款日期", "预计尾款时间", "预计尾款日期"],
      toUnixTs(body.finalPaymentDate)
    );



    console.log("🟧 POST /api/deals fields:", fields);



    const data = await batchCreateRecords({

      appToken: DEAL_APP_TOKEN,

      tableId: DEAL_TABLE_ID,

      records: [{ fields }],

    });



    const recordId = data?.records?.[0]?.record_id;

    if (!recordId) {

      return res.status(500).json({

        success: false,

        error: "feishu returned no record_id",

        data,

      });

    }



    return res.json({ success: true, record_id: recordId, data, fields, warnings });

  } catch (e) {

    console.error("POST /api/deals failed:", e);

    return res.status(500).json({ success: false, error: String(e) });

  }
  });
});



app.put("/api/deals/:dealId", async (req, res) => {
  return withIdempotency(req, res, async () => {
  try {

    if (!DEAL_APP_TOKEN || !DEAL_TABLE_ID) {

      return res.status(500).json({

        success: false,

        error:

          "missing deal appToken/tableId (FEISHU_DEAL_APP_TOKEN/FEISHU_BITABLE_DEAL_TABLE_ID)",

      });

    }



    const dealId = String(req.params.dealId || "").trim();

    const recordId = await findDealRecordIdByDealId(dealId);

    if (!recordId)

      return res.status(404).json({ success: false, error: "deal not found" });



    const body = req.body || {};

    const fields = {};

    const normalizeMonth = (v) => {

      const s = String(v ?? "").trim();

      if (!s) return undefined;

      const m = s.match(/(?:^|\.)(\d{1,2})$/);

      const n = Number(m ? m[1] : s);

      return Number.isFinite(n) ? n : s;

    };



    const toUnixTs = (v) => {

      if (v === undefined || v === null) return undefined;

      if (typeof v === "number" && Number.isFinite(v)) return v < 1e11 ? v * 1000 : v;

      const s = String(v).trim();

      if (!s) return undefined;

      if (/^\d+$/.test(s)) {

        const num = Number(s);

        if (!Number.isFinite(num)) return undefined;

        return num < 1e11 ? num * 1000 : num;

      }

      const d = new Date(s.replace(/\//g, "-"));

      if (Number.isNaN(d.getTime())) return undefined;

      return d.getTime();

    };



    const items = await listFields({ appToken: DEAL_APP_TOKEN, tableId: DEAL_TABLE_ID });

    const fieldNames = new Set((items || []).map((f) => f.field_name));

    const warnings = [];
    const findFieldName = (name) => {
      if (fieldNames.has(name)) return name;
      const matched = Array.from(fieldNames).find((n) => String(n).includes(name));
      return matched || null;
    };

    const toBoolMaybe = (value) => {
      if (value === true || value === false) return value;
      const s = String(value ?? '').trim().toLowerCase();
      if (!s) return null;
      if (['是', 'true', '1', 'yes', 'y'].includes(s)) return true;
      if (['否', 'false', '0', 'no', 'n'].includes(s)) return false;
      return null;
    };

    const toYesNoMaybe = (value) => {
      if (value === true) return '是';
      if (value === false) return '否';
      return null;
    };

    const getFieldInfo = (name) =>
      fieldInfoMap.get(normalizeFieldName(name)) || { name, type: null, options: [] };

    const setSelectField = (name, value) => {
      const info = getFieldInfo(name);
      if (!fieldNames.has(info.name)) {
        warnings.push(`field not found: ${name}`);
        return;
      }
      const optionName = resolveSelectOptionName(info, value);
      const selectValue = toSelectValue(optionName, info.type);
      setIf(info.name, selectValue);
    };

    const normalizeFinishedValue = (value) => {
      if (value === true) return "是";
      if (value === false) return "否";
      const raw = String(value ?? "").trim();
      if (!raw) return "";
      const lower = raw.toLowerCase();
      if (["true", "yes", "y", "1"].includes(lower)) return "是";
      if (["false", "no", "n", "0"].includes(lower)) return "否";
      return raw;
    };
    

    const setIf = (name, value) => {

      const isEmptyString = typeof value === "string" && value.trim() === "";

      if (value === undefined || value === null || isEmptyString) return;

      if (!fieldNames.has(name)) {

        warnings.push(`field not found: ${name}`);

        return;

      }

      fields[name] = value;

    };

    const setIfAlias = (names, value) => {
      const isEmptyString = typeof value === "string" && value.trim() === "";
      if (value === undefined || value === null || isEmptyString) return;
      const target =
        names
          .map((name) => (fieldNames.has(name) ? name : findFieldName(name)))
          .find(Boolean) || null;
      if (!target) {
        warnings.push(`field not found: ${names[0]}`);
        return;
      }
      fields[target] = value;
    };





    // 如果表里没有项目ID/名称字段，这些会被忽?
    setIf("项目ID", String(body.projectId || "").trim());

    setIf("客户ID", String(body.customerId || "").trim());

    // setIf("项目名称", String(body.projectName || "").trim());

    const monthVal = normalizeMonth(body.month);

    if (monthVal !== undefined) {
      setIf("所属月份", monthVal);
      setIf("所属年月", monthVal);
    }

    setIf("项目开始时间", toUnixTs(body.startDate));
    setIf("项目开始日期", toUnixTs(body.startDate));

    setIf("项目结束时间", toUnixTs(body.endDate));
    setIf("归属", body.belong);

    const finishedFieldName = findFieldName("是否完结");
    if (finishedFieldName) {
      setIf(finishedFieldName, body.isFinished);
    } else if (body.isFinished !== undefined && body.isFinished !== null) {
      warnings.push("field not found: 是否完结");
    }

    setIf("签约公司主体", body.signCompany);



    if (body.incomeWithTax !== undefined && body.incomeWithTax !== "")

      setIf("含税收入", Number(body.incomeWithTax));

    if (body.incomeWithoutTax !== undefined && body.incomeWithoutTax !== "")
      setIf("不含税收入", Number(body.incomeWithoutTax));

    if (body.estimatedCost !== undefined && body.estimatedCost !== "")

      setIf("预估成本", Number(body.estimatedCost));

    if (body.paidThirdPartyCost !== undefined && body.paidThirdPartyCost !== "") {
      const num = Number(body.paidThirdPartyCost);
      if (Number.isFinite(num)) {
        setIfAlias(
          ["已付项目成本【三方】", "已付项目成本（三方）", "已付项目成本(三方)", "已付三方成本"],
          num
        );
      }
    }

    if (body.receivedAmount !== undefined && body.receivedAmount !== "")

      setIf("已收金额", Number(body.receivedAmount));



    if (body.thirdPartyCost !== undefined && body.thirdPartyCost !== "") {
      const num = Number(body.thirdPartyCost);
      if (Number.isFinite(num)) {
        setIfAlias(
          ["已付项目成本【三方】", "已付项目成本（三方）", "已付项目成本(三方)", "已付三方成本"],
          num
        );
      }
    }

    if (body.grossProfit !== undefined && body.grossProfit !== "")

      setIf("毛利", Number(body.grossProfit));

    if (body.grossMargin !== undefined && body.grossMargin !== "")
      setIf("毛利率", Number(body.grossMargin));

    if (body.remainingReceivable !== undefined && body.remainingReceivable !== "")

      setIf("剩余应收金额", Number(body.remainingReceivable));



    setIfAlias(
      ["预计下一次到款时间", "预计下一次到款日期", "预计下次到款时间", "预计下次到款日期", "预计首款时间", "预计首款日期"],
      toUnixTs(body.firstPaymentDate)
    );

    setIfAlias(
      ["全款实际到款时间", "全款实际到款日期", "实际到款时间", "实际到款日期", "预计尾款时间", "预计尾款日期"],
      toUnixTs(body.finalPaymentDate)
    );



    console.log("🟧 PUT /api/deals fields:", fields, "recordId=", recordId);



    let data;
    try {
      data = await updateRecord({
        appToken: DEAL_APP_TOKEN,
        tableId: DEAL_TABLE_ID,
        recordId,
        fields,
      });
    } catch (e) {
      if (finishedFieldName) {
        const altValue =
          typeof body.isFinished === "boolean"
            ? toYesNoMaybe(body.isFinished)
            : toBoolMaybe(body.isFinished);
        if (altValue !== null && altValue !== undefined) {
          const retryFields = { ...fields, [finishedFieldName]: altValue };
          data = await updateRecord({
            appToken: DEAL_APP_TOKEN,
            tableId: DEAL_TABLE_ID,
            recordId,
            fields: retryFields,
          });
          fields[finishedFieldName] = altValue;
        } else {
          throw e;
        }
      } else {
        throw e;
      }
    }

    apiCache.delete("deals:all");

    return res.json({ success: true, record_id: recordId, data, fields, warnings });

  } catch (e) {

    console.error("PUT /api/deals/:dealId failed:", e);

    return res.status(500).json({ success: false, error: String(e) });

  }
  });
});



// ====== 三方成本明细 ======

const COST_FIELD = {
  serialNo: "编号",
  relatedDeal: "关联立项",
  projectId: "项目ID",
  projectName: "项目名称",
  period: "期数",
  amount: "本期新增金额",
  createdDate: "创建日期",
  remark: "备注",
};

const looksLikeRecordId = (value) => /^rec[a-z0-9]+/i.test(String(value || "").trim());

const parseRelationIds = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (!item) return "";
        if (typeof item === "string") return item;
        if (typeof item === "object" && item !== null) {
          return item.record_id || item.recordId || item.id || item.value || item.text || "";
        }
        return String(item);
      })
      .map((v) => String(v || "").trim())
      .filter(Boolean);
  }
  if (typeof value === "object" && value !== null) {
    const recordIds =
      value.record_ids ||
      value.recordIds ||
      value.link_record_ids ||
      value.linkRecordIds ||
      value.records ||
      null;
    if (Array.isArray(recordIds)) {
      return recordIds
        .map((item) => {
          if (!item) return "";
          if (typeof item === "string") return item;
          if (typeof item === "object") {
            return item.record_id || item.recordId || item.id || item.value || item.text || "";
          }
          return String(item);
        })
        .map((v) => String(v || "").trim())
        .filter(Boolean);
    }
    const v = value.record_id || value.recordId || value.id || value.value || value.text || "";
    return v ? [String(v).trim()] : [];
  }
  const raw = String(value || "").trim();
  return raw ? [raw] : [];
};

async function sumCostAmountByRelatedDeal(relatedDealKeys) {
  const keys = Array.isArray(relatedDealKeys) ? relatedDealKeys : [relatedDealKeys];
  const targets = keys
    .map((k) => String(k || "").trim().toLowerCase())
    .filter(Boolean);
  if (targets.length === 0) return 0;
  const records = [];
  let pageToken = "";
  for (;;) {
    const { items, hasMore, pageToken: nextToken } = await listRecordsWithMeta({
      appToken: COST_APP_TOKEN,
      tableId: COST_TABLE_ID,
      pageSize: 200,
      pageToken,
    });
    records.push(...(items || []));
    if (!hasMore || !nextToken) break;
    pageToken = nextToken;
  }
  let sum = 0;
  for (const it of records || []) {
    const mapped = mapCostRecord(it);
    const relatedIds = (mapped.relatedDealRecordIds || []).map((id) => String(id || "").trim().toLowerCase());
    const hit = relatedIds.some((id) => targets.includes(id));
    if (!hit) continue;
    const num = mapped.amount;
    if (typeof num === "number" && Number.isFinite(num)) sum += num;
  }
  return Math.round((sum + Number.EPSILON) * 100) / 100;
}

async function syncDealPaidThirdPartyCost(relatedKeys) {
  if (!DEAL_APP_TOKEN || !DEAL_TABLE_ID) {
    return { error: "缺少立项表 appToken/tableId" };
  }
  const keys = Array.isArray(relatedKeys) ? relatedKeys : [relatedKeys];
  const cleaned = keys.map((k) => String(k || "").trim()).filter(Boolean);
  if (cleaned.length === 0) return { error: "缺少关联立项信息" };

  const totalCost = await sumCostAmountByRelatedDeal(cleaned);
  const dealRecordIdForUpdate =
    (await resolveDealRecordIdByAny(cleaned[0])) ||
    (await resolveDealRecordIdByAny(cleaned[1])) ||
    (await resolveDealRecordIdByAny(cleaned[2])) ||
    (await resolveDealRecordIdByAny(cleaned[3])) ||
    cleaned[0];

  const dealFieldInfo = await getFieldInfoMap(DEAL_APP_TOKEN, DEAL_TABLE_ID);
  const dealFields = {};
  const preferredNames = [
    "已付项目成本【三方】",
    "已付项目成本（三方）",
    "已付项目成本(三方)",
    "已付三方成本",
  ];
  const pickName =
    preferredNames.find((name) => {
      const info = dealFieldInfo.get(normalizeFieldName(name));
      if (!info) return false;
      return !isReadonlyField(dealFieldInfo, name);
    }) || null;
  if (!pickName) {
    return { error: "未找到可写入的已付项目成本字段（可能是公式字段/只读）" };
  }

  dealFields[pickName] = totalCost;
  await updateRecord({
    appToken: DEAL_APP_TOKEN,
    tableId: DEAL_TABLE_ID,
    recordId: dealRecordIdForUpdate,
    fields: dealFields,
  });

  let actualValue = null;
  try {
    const refreshed = await getRecordById({
      appToken: DEAL_APP_TOKEN,
      tableId: DEAL_TABLE_ID,
      recordId: dealRecordIdForUpdate,
    });
    const raw = refreshed?.fields?.[pickName];
    if (raw === null || raw === undefined || raw === "") {
      actualValue = null;
    } else if (typeof raw === "number") {
      actualValue = raw;
    } else if (typeof raw === "object" && raw !== null) {
      const v = raw.value ?? raw.number ?? raw.amount ?? raw.text ?? raw.name ?? raw;
      const n = Number(String(v).replace(/[,\s¥￥]/g, ""));
      actualValue = Number.isNaN(n) ? v : n;
    } else {
      const n = Number(String(raw).replace(/[,\s¥￥]/g, ""));
      actualValue = Number.isNaN(n) ? raw : n;
    }
  } catch (e) {
    console.warn("读取立项表回写值失败:", e);
  }

  apiCache.delete("deals:all");
  return {
    recordId: dealRecordIdForUpdate,
    field: pickName,
    value: totalCost,
    actualValue,
  };
}

function mapCostRecord(it = {}) {
  const f = it.fields || {};
  const pickSingle = (v) => {
    if (Array.isArray(v)) return pickSingle(v[0]);
    if (typeof v === "object" && v !== null) {
      return v?.name ?? v?.text ?? v?.label ?? v?.value ?? v?.option_name ?? "";
    }
    return v ?? "";
  };

  const normalizeNumber = (raw) => {
    if (raw === null || raw === undefined || raw === "") return null;
    if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
    const str = String(raw).replace(/[,\s¥￥]/g, "").trim();
    if (!str) return null;
    const num = Number(str);
    return Number.isNaN(num) ? null : num;
  };

  const pickNumber = (v) => {
    if (v === null || v === undefined || v === "") return null;
    if (Array.isArray(v)) return pickNumber(v[0]);
    if (typeof v === "object" && v !== null) {
      const raw = v?.value ?? v?.amount ?? v?.number ?? v?.text ?? v?.name ?? v;
      return normalizeNumber(raw);
    }
    return normalizeNumber(v);
  };

  const normalizeAny = (v) => {
    if (Array.isArray(v)) {
      const arr = v.map((item) => pickSingle(item)).filter(Boolean);
      return arr.join(", ");
    }
    if (typeof v === "object" && v !== null) {
      return pickSingle(v);
    }
    return v ?? "";
  };

  const relatedIds = parseRelationIds(f[COST_FIELD.relatedDeal] || f.relatedDeal || f["关联立项"]);
  const createdRaw =
    f[COST_FIELD.createdDate] ||
    f.createdDate ||
    f["创建日期"] ||
    f["创建时间"] ||
    it.created_time ||
    "";

  const result = {
    recordId: it.record_id || "",
    serialNo: f[COST_FIELD.serialNo] || f["编号"] || f.serialNo || "",
    relatedDealRecordIds: relatedIds,
    relatedDealRecordId: relatedIds[0] || "",
    projectId: f[COST_FIELD.projectId] || f.projectId || "",
    projectName: f[COST_FIELD.projectName] || f.projectName || "",
    period: pickNumber(f[COST_FIELD.period] || f.period),
    amount: pickNumber(f[COST_FIELD.amount] || f.amount),
    createdDate: createdRaw,
    remark: f[COST_FIELD.remark] || f.remark || "",
  };

  result.projectId = normalizeAny(result.projectId);
  result.projectName = normalizeAny(result.projectName);
  result.remark = normalizeAny(result.remark);
  result.createdDate = formatDateLoose(normalizeAny(result.createdDate));

  return result;
}

app.get("/api/costs", async (req, res) => {
  try {
    if (!COST_APP_TOKEN || !COST_TABLE_ID) {
      return res.status(500).json({
        success: false,
        error:
          "missing cost appToken/tableId (FEISHU_COST_APP_TOKEN/FEISHU_BITABLE_COST_TABLE_ID or FEISHU_BITABLE_THIRD_PARTY_COST_TABLE_ID)",
      });
    }

    const projectName = String(req.query.projectName || "").trim().toLowerCase();
    const projectId = String(req.query.projectId || "").trim();
    const relatedDealRecordIdRaw = String(req.query.relatedDealRecordId || "").trim();
    let relatedDealRecordId = relatedDealRecordIdRaw.toLowerCase();
    const relatedDealId = String(req.query.relatedDealId || req.query.dealId || "").trim();
    const relatedDealSerialNo = String(
      req.query.relatedDealSerialNo || req.query.relatedDealNo || ""
    ).trim();
    if (relatedDealId) {
      const resolved = await resolveDealRecordIdByAny(relatedDealId);
      if (resolved) relatedDealRecordId = String(resolved || "").trim().toLowerCase();
    }
    if (!relatedDealRecordId && relatedDealSerialNo) {
      const resolved = await resolveDealRecordIdByAny(relatedDealSerialNo);
      if (resolved) relatedDealRecordId = String(resolved || "").trim().toLowerCase();
    }
    if (!relatedDealRecordId && relatedDealRecordIdRaw && !looksLikeRecordId(relatedDealRecordIdRaw)) {
      const resolved = await resolveDealRecordIdByAny(relatedDealRecordIdRaw);
      if (resolved) relatedDealRecordId = String(resolved || "").trim().toLowerCase();
    }

    const shouldBypassCache = ["1", "true", "yes"].includes(
      String(req.query.fresh || req.query.noCache || "").trim().toLowerCase()
    );

    const fetchAllCosts = async () => {
      const records = [];
      let pageToken = "";
      for (;;) {
        const { items, hasMore, pageToken: nextToken } = await listRecordsWithMeta({
          appToken: COST_APP_TOKEN,
          tableId: COST_TABLE_ID,
          pageSize: 200,
          pageToken,
        });
        records.push(...(items || []));
        if (!hasMore || !nextToken) break;
        pageToken = nextToken;
      }
      return (records || []).map((it) => mapCostRecord(it));
    };

    const costsAll = shouldBypassCache
      ? await fetchAllCosts()
      : await withCache("costs:all", API_CACHE_TTL_MS, fetchAllCosts);

    let costs = costsAll || [];
    if (projectName) {
      costs = costs.filter((c) => String(c.projectName || "").toLowerCase().includes(projectName));
    }
    if (projectId) {
      const target = String(projectId || "").trim();
      costs = costs.filter((c) => String(c.projectId || "").includes(target));
    }
    if (relatedDealRecordId || relatedDealId || relatedDealSerialNo || relatedDealRecordIdRaw) {
      const keys = [
        relatedDealRecordId,
        relatedDealId,
        relatedDealSerialNo,
        relatedDealRecordIdRaw,
      ]
        .map((v) => String(v || "").trim().toLowerCase())
        .filter(Boolean);
      if (keys.length > 0) {
        costs = costs.filter((c) =>
          (c.relatedDealRecordIds || []).some((id) =>
            keys.includes(String(id || "").trim().toLowerCase())
          )
        );
      }
    }

    res.json({ success: true, data: costs });
  } catch (e) {
    console.error("GET /api/costs failed:", e);
    res.status(500).json({ success: false, error: String(e) });
  }
});

app.post("/api/costs", async (req, res) => {
  return withIdempotency(req, res, async () => {
  try {
    if (!COST_APP_TOKEN || !COST_TABLE_ID) {
      return res.status(500).json({
        success: false,
        error:
          "missing cost appToken/tableId (FEISHU_COST_APP_TOKEN/FEISHU_BITABLE_COST_TABLE_ID or FEISHU_BITABLE_THIRD_PARTY_COST_TABLE_ID)",
      });
    }

    const body = req.body || {};
    const relatedDealRecordIdRaw = String(
      body.relatedDealRecordId || body.relatedDealRecord || ""
    ).trim();
    let relatedDealRecordId = relatedDealRecordIdRaw;
    const dealId = String(body.relatedDealId || body.dealId || "").trim();
    const dealSerialNo = String(body.relatedDealSerialNo || body.relatedDealNo || "").trim();
    if (dealId) {
      relatedDealRecordId =
        (await resolveDealRecordIdByAny(dealId)) || relatedDealRecordId;
    }
    if (!relatedDealRecordId && dealSerialNo) {
      relatedDealRecordId =
        (await resolveDealRecordIdByAny(dealSerialNo)) || relatedDealRecordId;
    }
    if (!relatedDealRecordId && relatedDealRecordIdRaw && !looksLikeRecordId(relatedDealRecordIdRaw)) {
      relatedDealRecordId =
        (await resolveDealRecordIdByAny(relatedDealRecordIdRaw)) || relatedDealRecordId;
    }

    if (!relatedDealRecordId) {
      return res.status(400).json({ success: false, error: "missing relatedDealRecordId" });
    }

    const fieldInfoMap = await getFieldInfoMap(COST_APP_TOKEN, COST_TABLE_ID);

    const normalizeNumber = (raw) => {
      if (raw === null || raw === undefined || raw === "") return null;
      if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
      const str = String(raw).replace(/[,\s¥￥]/g, "").trim();
      if (!str) return null;
      const num = Number(str);
      return Number.isNaN(num) ? null : num;
    };

    const toUnixTs = (v) => {
      if (v === undefined || v === null) return null;
      if (typeof v === "number" && Number.isFinite(v)) return v < 1e11 ? v * 1000 : v;
      const s = String(v).trim();
      if (!s) return null;
      if (/^\d+$/.test(s)) {
        const num = Number(s);
        if (!Number.isFinite(num)) return null;
        return num < 1e11 ? num * 1000 : num;
      }
      const d = new Date(s.replace(/\//g, "-"));
      if (Number.isNaN(d.getTime())) return null;
      return d.getTime();
    };

    const setTypedField = (fieldName, rawValue) => {
      const info = fieldInfoMap?.get(normalizeFieldName(fieldName));
      if (info && isReadonlyField(fieldInfoMap, fieldName)) return;
      const isEmptyString = typeof rawValue === "string" && rawValue.trim() === "";
      if (rawValue === undefined || rawValue === null || isEmptyString) return;
      const type = info?.type;
      if (type === 2) {
        const num = normalizeNumber(rawValue);
        if (num === null) return;
        fields[fieldName] = num;
        return;
      }
      if (type === 5) {
        const ts = toUnixTs(rawValue);
        if (ts === null) return;
        fields[fieldName] = ts;
        return;
      }
      fields[fieldName] = String(rawValue);
    };

    const fields = {};
    fields[COST_FIELD.relatedDeal] = [relatedDealRecordId];

    setTypedField(COST_FIELD.period, body.period);
    setTypedField(COST_FIELD.amount, body.amount ?? body.currentAmount ?? body.newAmount);
    setTypedField(COST_FIELD.remark, String(body.remark || body.note || "").trim());

    const createdDateRaw = body.createdDate || body.createdAt || "";
    const createdDate =
      createdDateRaw && String(createdDateRaw).trim()
        ? String(createdDateRaw).trim()
        : formatLocalDate(new Date());
    setTypedField(COST_FIELD.createdDate, createdDate);

    const data = await batchCreateRecords({
      appToken: COST_APP_TOKEN,
      tableId: COST_TABLE_ID,
      records: [{ fields }],
    });

    const recordId = data?.records?.[0]?.record_id;
    if (!recordId) {
      return res.status(500).json({
        success: false,
        error: "feishu returned no record_id",
        data,
      });
    }

    let dealUpdate = null;
    try {
      dealUpdate = await syncDealPaidThirdPartyCost([
        relatedDealRecordId,
        relatedDealRecordIdRaw,
        dealSerialNo,
        dealId,
      ]);
    } catch (e) {
      console.warn("同步已付项目成本【三方】失败:", e);
      dealUpdate = { error: String(e) };
    }

    apiCache.delete("costs:all");
    return res.json({ success: true, record_id: recordId, data, fields, dealUpdate });
  } catch (e) {
    console.error("POST /api/costs failed:", e);
    return res.status(500).json({ success: false, error: String(e) });
  }
  });
});

app.post("/api/costs/batch", async (req, res) => {
  return withIdempotency(req, res, async () => {
    try {
      if (!COST_APP_TOKEN || !COST_TABLE_ID) {
        return res.status(500).json({
          success: false,
          error:
            "missing cost appToken/tableId (FEISHU_COST_APP_TOKEN/FEISHU_BITABLE_COST_TABLE_ID or FEISHU_BITABLE_THIRD_PARTY_COST_TABLE_ID)",
        });
      }

      const payload = req.body || {};
      const items = Array.isArray(payload) ? payload : Array.isArray(payload.records) ? payload.records : [];
      if (items.length === 0) {
        return res.status(400).json({ success: false, error: "missing records" });
      }

      const fieldInfoMap = await getFieldInfoMap(COST_APP_TOKEN, COST_TABLE_ID);

      const normalizeNumber = (raw) => {
        if (raw === null || raw === undefined || raw === "") return null;
        if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
        const str = String(raw).replace(/[,\s¥￥]/g, "").trim();
        if (!str) return null;
        const num = Number(str);
        return Number.isNaN(num) ? null : num;
      };

      const toUnixTs = (v) => {
        if (v === undefined || v === null) return null;
        if (typeof v === "number" && Number.isFinite(v)) return v < 1e11 ? v * 1000 : v;
        const s = String(v).trim();
        if (!s) return null;
        if (/^\d+$/.test(s)) {
          const num = Number(s);
          if (!Number.isFinite(num)) return null;
          return num < 1e11 ? num * 1000 : num;
        }
        const d = new Date(s.replace(/\//g, "-"));
        if (Number.isNaN(d.getTime())) return null;
        return d.getTime();
      };

      const setTypedField = (fields, fieldName, rawValue) => {
        const info = fieldInfoMap?.get(normalizeFieldName(fieldName));
        if (info && isReadonlyField(fieldInfoMap, fieldName)) return;
        const isEmptyString = typeof rawValue === "string" && rawValue.trim() === "";
        if (rawValue === undefined || rawValue === null || isEmptyString) return;
        const type = info?.type;
        if (type === 2) {
          const num = normalizeNumber(rawValue);
          if (num === null) return;
          fields[fieldName] = num;
          return;
        }
        if (type === 5) {
          const ts = toUnixTs(rawValue);
          if (ts === null) return;
          fields[fieldName] = ts;
          return;
        }
        fields[fieldName] = String(rawValue);
      };

      const relatedKeys = [];
      const records = [];
      for (const raw of items) {
        const body = raw?.fields || raw || {};
        const relatedDealRecordIdRaw = String(
          body.relatedDealRecordId || body.relatedDealRecord || ""
        ).trim();
        let relatedDealRecordId = relatedDealRecordIdRaw;
        const dealId = String(body.relatedDealId || body.dealId || "").trim();
        const dealSerialNo = String(body.relatedDealSerialNo || body.relatedDealNo || "").trim();
        if (dealId) {
          relatedDealRecordId =
            (await resolveDealRecordIdByAny(dealId)) || relatedDealRecordId;
        }
        if (!relatedDealRecordId && dealSerialNo) {
          relatedDealRecordId =
            (await resolveDealRecordIdByAny(dealSerialNo)) || relatedDealRecordId;
        }
        if (!relatedDealRecordId && relatedDealRecordIdRaw && !looksLikeRecordId(relatedDealRecordIdRaw)) {
          relatedDealRecordId =
            (await resolveDealRecordIdByAny(relatedDealRecordIdRaw)) || relatedDealRecordId;
        }
        if (!relatedDealRecordId) {
          return res.status(400).json({ success: false, error: "missing relatedDealRecordId" });
        }

        const fields = {};
        fields[COST_FIELD.relatedDeal] = [relatedDealRecordId];
        setTypedField(fields, COST_FIELD.period, body.period);
        setTypedField(fields, COST_FIELD.amount, body.amount ?? body.currentAmount ?? body.newAmount);
        setTypedField(fields, COST_FIELD.remark, String(body.remark || body.note || "").trim());

        const createdDateRaw = body.createdDate || body.createdAt || "";
        const createdDate =
          createdDateRaw && String(createdDateRaw).trim()
            ? String(createdDateRaw).trim()
            : formatLocalDate(new Date());
        setTypedField(fields, COST_FIELD.createdDate, createdDate);

        records.push({ fields });
        relatedKeys.push([relatedDealRecordId, relatedDealRecordIdRaw, dealSerialNo, dealId]);
      }

      const data = await batchCreateRecords({
        appToken: COST_APP_TOKEN,
        tableId: COST_TABLE_ID,
        records,
      });

      const uniqueRelated = [];
      const seen = new Set();
      relatedKeys.forEach((keys) => {
        const key = keys.map((k) => String(k || "").trim()).filter(Boolean).join("|");
        if (!key || seen.has(key)) return;
        seen.add(key);
        uniqueRelated.push(keys);
      });

      const dealUpdates = await Promise.all(
        uniqueRelated.map(async (keys) => {
          try {
            return await syncDealPaidThirdPartyCost(keys);
          } catch (e) {
            return { error: String(e) };
          }
        })
      );

      apiCache.delete("costs:all");
      return res.json({ success: true, data, dealUpdates });
    } catch (e) {
      console.error("POST /api/costs/batch failed:", e);
      return res.status(500).json({ success: false, error: String(e) });
    }
  });
});

app.put("/api/costs/:recordId", async (req, res) => {
  return withIdempotency(req, res, async () => {
    try {
      if (!COST_APP_TOKEN || !COST_TABLE_ID) {
        return res.status(500).json({
          success: false,
          error:
            "missing cost appToken/tableId (FEISHU_COST_APP_TOKEN/FEISHU_BITABLE_COST_TABLE_ID or FEISHU_BITABLE_THIRD_PARTY_COST_TABLE_ID)",
        });
      }

      const recordId = String(req.params.recordId || "").trim();
      if (!recordId) {
        return res.status(400).json({ success: false, error: "missing recordId" });
      }

      const body = req.body || {};
      const fieldInfoMap = await getFieldInfoMap(COST_APP_TOKEN, COST_TABLE_ID);
      const fields = {};

      const normalizeNumber = (raw) => {
        if (raw === null || raw === undefined || raw === "") return null;
        if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
        const str = String(raw).replace(/[,\s¥￥]/g, "").trim();
        if (!str) return null;
        const num = Number(str);
        return Number.isNaN(num) ? null : num;
      };

      const toUnixTs = (v) => {
        if (v === undefined || v === null) return null;
        if (typeof v === "number" && Number.isFinite(v)) return v < 1e11 ? v * 1000 : v;
        const s = String(v).trim();
        if (!s) return null;
        if (/^\d+$/.test(s)) {
          const num = Number(s);
          if (!Number.isFinite(num)) return null;
          return num < 1e11 ? num * 1000 : num;
        }
        const d = new Date(s.replace(/\//g, "-"));
        if (Number.isNaN(d.getTime())) return null;
        return d.getTime();
      };

      const setTypedField = (fieldName, rawValue) => {
        const info = fieldInfoMap?.get(normalizeFieldName(fieldName));
        if (info && isReadonlyField(fieldInfoMap, fieldName)) return;
        const isEmptyString = typeof rawValue === "string" && rawValue.trim() === "";
        if (rawValue === undefined || rawValue === null || isEmptyString) return;
        const type = info?.type;
        if (type === 2) {
          const num = normalizeNumber(rawValue);
          if (num === null) return;
          fields[fieldName] = num;
          return;
        }
        if (type === 5) {
          const ts = toUnixTs(rawValue);
          if (ts === null) return;
          fields[fieldName] = ts;
          return;
        }
        fields[fieldName] = String(rawValue);
      };

      setTypedField(COST_FIELD.amount, body.amount ?? body.currentAmount ?? body.newAmount);
      setTypedField(COST_FIELD.remark, String(body.remark || body.note || "").trim());

      const data = await updateRecord({
        appToken: COST_APP_TOKEN,
        tableId: COST_TABLE_ID,
        recordId,
        fields,
      });

      const refreshed = await getRecordById({
        appToken: COST_APP_TOKEN,
        tableId: COST_TABLE_ID,
        recordId,
      });
      const relatedIds = parseRelationIds(
        refreshed?.fields?.[COST_FIELD.relatedDeal] ||
          refreshed?.fields?.relatedDeal ||
          refreshed?.fields?.["关联立项"]
      );

      const dealUpdate = await syncDealPaidThirdPartyCost(relatedIds);
      apiCache.delete("costs:all");
      return res.json({ success: true, record_id: recordId, data, fields, dealUpdate });
    } catch (e) {
      console.error("PUT /api/costs/:recordId failed:", e);
      return res.status(500).json({ success: false, error: String(e) });
    }
  });
});

app.get("/api/test-deal-fields", async (req, res) => {

  try {

    if (!DEAL_APP_TOKEN || !DEAL_TABLE_ID) {

      return res.status(500).json({

        success: false,

        error:

          "missing deal appToken/tableId (FEISHU_DEAL_APP_TOKEN/FEISHU_BITABLE_DEAL_TABLE_ID)",

      });

    }

    const items = await listFields({

      appToken: DEAL_APP_TOKEN,

      tableId: DEAL_TABLE_ID,

    });

    const simple = (items || []).map((f) => ({

      field_id: f.field_id,

      field_name: f.field_name,

      type: f.type,

    }));

    res.json({ success: true, data: simple });

  } catch (e) {

    console.error("GET /api/test-deal-fields failed:", e);

    res.status(500).json({ success: false, error: String(e) });

  }

});



// ====== 列出项目表里的人员字段可用值（调试用）======

// 用于解决“前端传姓名，但飞书 Person 字段需?user_id”的问题?
// 扫描项目表前 200 条记录里 BD/AM 字段出现过的人员对象，输?name -> id?
app.get("/api/project-persons", async (req, res) => {

  try {

    if (!PROJECT_APP_TOKEN || !PROJECT_TABLE_ID) {

      return res.status(500).json({

        success: false,

        error: "missing project appToken/tableId",

      });

    }



    const items = await listRecords({

      appToken: PROJECT_APP_TOKEN,

      tableId: PROJECT_TABLE_ID,

      pageSize: 200,

    });

    const collect = (records, fieldName) => {

      const map = new Map();

      for (const it of records || []) {

        const v = it?.fields?.[fieldName];

        if (!Array.isArray(v)) continue;

        for (const personObj of v) {

          const name = normalizePersonName(personObj?.name);

          const id = pickPersonId(personObj);

          if (name && id && !map.has(name)) map.set(name, id);

        }

      }

      return Array.from(map.entries())

        .map(([name, id]) => ({ name, id }))

        .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));

    };

    let customerBd = [];
    if (process.env.FEISHU_BITABLE_APP_TOKEN && process.env.FEISHU_BITABLE_TABLE_ID) {
      const customerItems = await listRecords({
        appToken: process.env.FEISHU_BITABLE_APP_TOKEN,
        tableId: process.env.FEISHU_BITABLE_TABLE_ID,
        pageSize: 200,
      });
      customerBd = collect(customerItems, "主BD负责人");
    }



    return res.json({

      success: true,

      data: {

        bd: collect(items, PROJECT_FIELD.bd),

        am: collect(items, PROJECT_FIELD.am),

        customer_bd: customerBd,

        env_map: readPersonIdMapFromEnv(),

      },

    });

  } catch (e) {

    console.error("GET /api/project-persons failed:", e);

    return res.status(500).json({ success: false, error: String(e) });

  }

});



// ====== 看板（Kanban）接口预?======

app.get("/api/kanban/embed", (req, res) => {
  const url = resolveKanbanEmbedUrl();
  if (!url) {
    return res.status(500).json({
      success: false,
      error:
        "missing FEISHU_KANBAN_EMBED_URL (or FEISHU_DASHBOARD_EMBED_URL with FEISHU_KANBAN_BOARD_ID)",
    });
  }
  return res.json({
    success: true,
    data: {
      url,
      boardId: KANBAN_BOARD_ID || null,
    },
  });
});

app.get("/api/kanban/boards", (req, res) => {

  const boards = KANBAN_BOARD_ID

    ? [{ id: KANBAN_BOARD_ID, name: "Feishu Kanban", description: "飞书看板占位" }]

    : [];

  return sendKanbanPlaceholder(res, boards, {

    target: { appToken: KANBAN_APP_TOKEN || null, boardId: KANBAN_BOARD_ID || null },

  });

});



app.get("/api/kanban/boards/:boardId", (req, res) => {

  const boardId = String(req.params.boardId || "").trim();

  const board = boardId

    ? { id: boardId, name: "Feishu Kanban", description: "飞书看板占位" }

    : null;

  return sendKanbanPlaceholder(res, board);

});



app.get("/api/kanban/boards/:boardId/columns", (req, res) => {

  return sendKanbanPlaceholder(res, []);

});



app.get("/api/kanban/boards/:boardId/cards", (req, res) => {

  return sendKanbanPlaceholder(res, []);

});



app.post("/api/kanban/boards/:boardId/cards", (req, res) => {

  const boardId = String(req.params.boardId || "").trim();

  const payload = req.body || {};

  return sendKanbanPlaceholder(res, null, {

    action: "create_card",

    boardId,

    payload,

  });

});



app.put("/api/kanban/boards/:boardId/cards/:cardId", (req, res) => {

  const boardId = String(req.params.boardId || "").trim();

  const cardId = String(req.params.cardId || "").trim();

  const payload = req.body || {};

  return sendKanbanPlaceholder(res, null, {

    action: "update_card",

    boardId,

    cardId,

    payload,

  });

});



app.patch("/api/kanban/boards/:boardId/cards/:cardId/move", (req, res) => {

  const boardId = String(req.params.boardId || "").trim();

  const cardId = String(req.params.cardId || "").trim();

  const payload = req.body || {};

  return sendKanbanPlaceholder(res, null, {

    action: "move_card",

    boardId,

    cardId,

    payload,

  });

});



app.post("/api/kanban/boards/:boardId/sync", (req, res) => {

  const boardId = String(req.params.boardId || "").trim();

  return sendKanbanPlaceholder(res, { syncedAt: new Date().toISOString() }, { boardId });

});



app.post("/api/kanban/boards/:boardId/push", (req, res) => {

  const boardId = String(req.params.boardId || "").trim();

  return sendKanbanPlaceholder(res, { pushedAt: new Date().toISOString() }, { boardId });

});



// ====== 仪表盘（Dashboard）嵌?======

app.get("/api/dashboard/embed", (req, res) => {

  if (!DASHBOARD_EMBED_URL) {

    return res.status(500).json({

      success: false,

      error: "missing FEISHU_DASHBOARD_EMBED_URL",

    });

  }

  return res.json({

    success: true,

    data: { url: DASHBOARD_EMBED_URL },

  });

});



if (process.env.VERCEL !== "1") {
  app.listen(PORT, () => {
    console.log(`?API server running at http://localhost:${PORT}`);
  });
}

export default app;
