import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");

export const PDF_REMOTE_BASE =
  process.env.PDF_REMOTE_BASE || "http://45.55.208.199:3000";

export const PDF_REMOTE_TIMEOUT_MS = Number(
  process.env.PDF_REMOTE_TIMEOUT_MS || 90_000,
);
export const PDF_MAX_BODY_MB = Number(process.env.PDF_MAX_BODY_MB || 5);

export const PDF_TEMPLATE_PATH =
  process.env.PDF_TEMPLATE_PATH ||
  path.join(ROOT, "src", "templates", "proposal.tex");

export const PDF_HEADER_TEMPLATE_PATH =
  process.env.PDF_HEADER_TEMPLATE_PATH ||
  path.join(ROOT, "src", "templates", "customer-header.tex");
