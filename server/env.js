import dotenv from "dotenv";
import { fileURLToPath } from "url";

const envPath = fileURLToPath(new URL("./.env", import.meta.url));
dotenv.config({ path: envPath });

const TRIM_ENV_KEYS = [
  "FEISHU_APP_ID",
  "FEISHU_APP_SECRET",
  "FEISHU_BITABLE_APP_TOKEN",
  "FEISHU_BITABLE_TABLE_ID",
  "FEISHU_PROJECT_APP_TOKEN",
  "FEISHU_BITABLE_PROJECT_TABLE_ID",
  "FEISHU_DEAL_APP_TOKEN",
  "FEISHU_BITABLE_DEAL_TABLE_ID",
  "FEISHU_KANBAN_APP_TOKEN",
  "FEISHU_KANBAN_BOARD_ID",
  "FEISHU_DASHBOARD_EMBED_URL",
  "FEISHU_USER_ACCESS_TOKEN",
  "FEISHU_OPEN_ID",
  "FEISHU_USER_OPEN_ID",
  "FEISHU_PERSON_ID_MAP",
  "DAILY_FORM_URL",
  "DAILY_FORM_BD_OPEN_IDS",
  "CRON_SECRET",
];

for (const key of TRIM_ENV_KEYS) {
  if (typeof process.env[key] === "string") {
    process.env[key] = process.env[key].trim();
  }
}
