import { findDueOutbox, updateCustomer, updateOutbox } from "@/local/db";
import type { OutboxRecord } from "@/local/db";
import { postCustomer } from "@/local/mockApi";

const LOOP_INTERVAL_MS = 3000;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30000;
const MAX_RETRY = 5;
const RETRY_SNOOZE_MS = 24 * 60 * 60 * 1000;

let loopTimer: number | undefined;
let running = false;
let started = false;

const getRetryDelay = (retryCount: number) =>
  Math.min(2 ** retryCount * BASE_DELAY_MS, MAX_DELAY_MS);

const normalizeError = (error: unknown) => {
  if (error instanceof Error) return error.message;
  return String(error ?? "unknown_error");
};

const handleCreateCustomer = async (record: OutboxRecord) => {
  const payload = record.payload as { tempId: string; name: string; phone?: string };
  const result = await postCustomer({
    tempId: payload.tempId,
    name: payload.name,
    phone: payload.phone,
  });
  const now = Date.now();
  await updateCustomer(payload.tempId, {
    serverId: result.id,
    syncStatus: "synced",
    lastSyncAt: now,
    retryCount: 0,
    errorMsg: undefined,
  });
  await updateOutbox(record.opId, {
    status: "done",
    lastError: undefined,
    nextAttemptAt: now,
  });
};

const handleFailure = async (record: OutboxRecord, error: unknown) => {
  const message = normalizeError(error);
  const now = Date.now();
  const delay = getRetryDelay(record.retryCount);
  const nextRetryCount = record.retryCount + 1;
  const reachedLimit = nextRetryCount >= MAX_RETRY;
  const nextAttemptAt = reachedLimit ? now + RETRY_SNOOZE_MS : now + delay;

  const payload = record.payload as { tempId?: string };
  if (payload?.tempId) {
    await updateCustomer(payload.tempId, {
      syncStatus: "failed",
      lastSyncAt: now,
      retryCount: nextRetryCount,
      errorMsg: message,
    });
  }

  await updateOutbox(record.opId, {
    status: "failed",
    retryCount: nextRetryCount,
    nextAttemptAt,
    lastError: message,
  });
};

const processOutbox = async () => {
  while (navigator.onLine) {
    const now = Date.now();
    const record = await findDueOutbox(now);
    if (!record) return;

    if (record.status === "failed" && record.retryCount >= MAX_RETRY) {
      await updateOutbox(record.opId, {
        nextAttemptAt: now + RETRY_SNOOZE_MS,
      });
      continue;
    }

    await updateOutbox(record.opId, { status: "processing" });

    try {
      if (record.type === "CREATE_CUSTOMER") {
        await handleCreateCustomer(record);
      } else {
        throw new Error("unsupported_outbox_type");
      }
    } catch (error) {
      await handleFailure(record, error);
    }
  }
};

export const triggerSync = () => {
  if (running || !navigator.onLine) return;
  running = true;
  processOutbox().finally(() => {
    running = false;
  });
};

export const startSyncLoop = () => {
  if (started) return;
  started = true;
  window.addEventListener("online", triggerSync);
  loopTimer = window.setInterval(() => {
    triggerSync();
  }, LOOP_INTERVAL_MS);
  triggerSync();
  return () => {
    if (loopTimer) {
      window.clearInterval(loopTimer);
    }
    window.removeEventListener("online", triggerSync);
  };
};
