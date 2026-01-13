import {
  clearStore,
  enqueueOutbox,
  getOutbox,
  listCustomers as listCustomerRecords,
  listOutboxByStatus,
  putCustomer,
  updateCustomer,
  updateOutbox,
} from "@/local/db";
import type { CustomerRecord, OutboxRecord } from "@/local/db";
import { triggerSync } from "@/local/syncWorker";

export type CreateCustomerInput = {
  name: string;
  phone?: string;
};

const makeUuid = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export const createCustomer = async (input: CreateCustomerInput): Promise<CustomerRecord> => {
  const now = Date.now();
  const tempId = makeUuid();
  const customer: CustomerRecord = {
    id: tempId,
    name: input.name,
    phone: input.phone,
    createdAt: now,
    updatedAt: now,
    syncStatus: "pending",
    retryCount: 0,
  };
  const outbox: OutboxRecord = {
    opId: makeUuid(),
    type: "CREATE_CUSTOMER",
    payload: {
      tempId,
      name: input.name,
      phone: input.phone,
    },
    status: "queued",
    createdAt: now,
    updatedAt: now,
    retryCount: 0,
    nextAttemptAt: now,
  };

  await putCustomer(customer);
  await enqueueOutbox(outbox);
  triggerSync();
  return customer;
};

export const listCustomers = async () => listCustomerRecords();

const resetOutboxForRetry = async (record: OutboxRecord, now: number) => {
  const payload = record.payload as { tempId?: string };
  if (payload?.tempId) {
    await updateCustomer(payload.tempId, {
      syncStatus: "pending",
      retryCount: 0,
      errorMsg: undefined,
    });
  }
  await updateOutbox(record.opId, {
    status: "queued",
    retryCount: 0,
    nextAttemptAt: now,
    lastError: undefined,
  });
};

export const retrySync = async (opId?: string) => {
  const now = Date.now();
  if (opId) {
    const record = await getOutbox(opId);
    if (!record) return;
    await resetOutboxForRetry(record, now);
    triggerSync();
    return;
  }
  const failed = await listOutboxByStatus("failed");
  for (const record of failed) {
    await resetOutboxForRetry(record, now);
  }
  if (failed.length > 0) {
    triggerSync();
  }
};

export const clearAllForDemo = async () => {
  await clearStore("customers");
  await clearStore("outbox");
};
