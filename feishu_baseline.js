#!/usr/bin/env node
// 飞书接口性能 baseline 测试
import { readFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const loadEnv = (envPath) => {
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!key || process.env[key] !== undefined) continue;
    process.env[key] = value;
  }
};

loadEnv(path.join(__dirname, "server", ".env"));

const RUNS = Number(process.env.FEISHU_BASELINE_RUNS || 10);

const APP_ID = process.env.FEISHU_APP_ID || "YOUR_APP_ID";
const APP_SECRET = process.env.FEISHU_APP_SECRET || "YOUR_APP_SECRET";
const APP_TOKEN = process.env.FEISHU_BITABLE_APP_TOKEN || "YOUR_APP_TOKEN";
const TABLE_ID = process.env.FEISHU_BITABLE_TABLE_ID || "YOUR_TABLE_ID";

const getTenantAccessToken = async () => {
  const res = await fetch(
    "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
    {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ app_id: APP_ID, app_secret: APP_SECRET }),
    }
  );
  const json = await res.json();
  return json.tenant_access_token;
};

const run = async () => {
  console.log("[FEISHU_TEST] 飞书接口性能 baseline 测试");

  const token = await getTenantAccessToken();
  const listUrl = `https://open.feishu.cn/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records?page_size=1`;
  const listRes = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const listJson = await listRes.json();
  const record = listJson?.data?.items?.[0] || {};
  const fields = record.fields || {};
  const fieldName =
    process.env.FEISHU_BASELINE_FIELD_NAME ||
    Object.keys(fields)[0] ||
    "baseline_flag";
  const fieldValue =
    process.env.FEISHU_BASELINE_FIELD_VALUE ?? fields[fieldName] ?? true;
  const recordId =
    process.env.FEISHU_BASELINE_RECORD_ID ||
    record.record_id ||
    "YOUR_RECORD_ID";

  const url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records/${recordId}`;
  const payload = { fields: { [fieldName]: fieldValue } };

  const costs = [];
  for (let i = 1; i <= RUNS; i += 1) {
    const start = Date.now();
    const res = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(payload),
    });
    await res.text();
    const cost = Date.now() - start;
    costs.push(cost);
    console.log(`[FEISHU_TEST] run=${i} cost_ms=${cost}`);
  }

  const count = costs.length;
  const sum = costs.reduce((acc, v) => acc + v, 0);
  const avg = Number((sum / count).toFixed(2));
  const sorted = [...costs].sort((a, b) => a - b);
  const p95Index = Math.max(0, Math.ceil(count * 0.95) - 1);
  const p95 = sorted[p95Index];
  const max = sorted[sorted.length - 1];

  console.log(
    `[FEISHU_TEST_SUMMARY] ${JSON.stringify({
      count,
      avg_ms: avg,
      p95_ms: p95,
      max_ms: max,
    })}`
  );
};

run();
