import "../server/env.js";
import { getRecordById, deleteRecords } from "../server/feishu.js";

const appToken = process.env.FEISHU_BITABLE_APP_TOKEN;
const tableId = process.env.FEISHU_BITABLE_TABLE_ID;
const baseUrl = process.env.LEAD_MONTH_TEST_BASE_URL || "http://localhost:4000";
const leadMonth = process.env.LEAD_MONTH_TEST_VALUE || "2025-04";

if (!appToken || !tableId) {
  console.error("[lead-month-test] missing FEISHU_BITABLE_APP_TOKEN/FEISHU_BITABLE_TABLE_ID");
  process.exit(1);
}

const makeStamp = () => new Date().toISOString().replace(/[:.]/g, "-");
const seed = `LEAD-MONTH-TEST-${makeStamp()}`;

const payload = {
  shortName: seed,
  companyName: seed,
  leadMonth,
  customerType: "潜在客户",
  level: "普通",
  industry: "其他B2B服务",
  hq: "测试地区",
  isAnnual: false,
};

const createRes = await fetch(`${baseUrl}/api/customers`, {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify(payload),
});

const createJson = await createRes.json().catch(() => ({}));
if (!createRes.ok || !createJson?.success) {
  console.error("[lead-month-test] create failed", {
    status: createRes.status,
    error: createJson?.error || createJson,
  });
  process.exit(1);
}

const recordId = createJson.record_id || createJson?.data?.records?.[0]?.record_id;
if (!recordId) {
  console.error("[lead-month-test] missing record_id", createJson);
  process.exit(1);
}

const record = await getRecordById({ appToken, tableId, recordId });
const fieldValue = record?.fields?.["线索月份"] ?? "";

console.log("[lead-month-test] write", { leadMonth, recordId });
console.log("[lead-month-test] server_fields", createJson?.fields || {});
console.log("[lead-month-test] read_after_create", fieldValue);

const updateValue = process.env.LEAD_MONTH_TEST_UPDATE || "2025-05";
const updateRes = await fetch(`${baseUrl}/api/customers/${encodeURIComponent(recordId)}`, {
  method: "PUT",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({ leadMonth: updateValue }),
});
const updateJson = await updateRes.json().catch(() => ({}));
if (!updateRes.ok || !updateJson?.success) {
  console.error("[lead-month-test] update failed", {
    status: updateRes.status,
    error: updateJson?.error || updateJson,
  });
} else {
  const updated = await getRecordById({ appToken, tableId, recordId });
  const updatedValue = updated?.fields?.["线索月份"] ?? "";
  console.log("[lead-month-test] update", { updateValue, updatedValue });
}

await deleteRecords({ appToken, tableId, recordIds: [recordId] });
console.log("[lead-month-test] cleanup", { recordId });
