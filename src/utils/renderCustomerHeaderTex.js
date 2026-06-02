import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import Mustache from "mustache";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = path.join(__dirname, "..", "templates", "proposal.tex");

export default function renderCustomerHeaderTex(viewJson) {
  throw new Error("renderCustomerHeaderTex not implemented. Move your existing JSON→TeX code here and return a TeX string.");
}
