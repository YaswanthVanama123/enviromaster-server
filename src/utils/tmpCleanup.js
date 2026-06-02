import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { PDF_OUTPUT_DIR } from "../config/storagePaths.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TMP_ROOT = path.join(__dirname, "..", "tmp");
const DEFAULT_MAX_AGE_MS = 5 * 60 * 1000;

async function cleanupDirectory(dirPath, options) {
  const { maxAgeMs, purgeAll } = options;
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (err) {
    if (err.code !== "EEXIST") {
      console.warn(`[TMP CLEANUP] Unable to ensure directory ${dirPath}:`, err.message);
    }
  }

  let removed = 0;
  const now = Date.now();
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(dirPath, entry.name);
      let stats;
      try {
        stats = await fs.stat(entryPath);
      } catch (statErr) {
        if (statErr.code === "ENOENT") continue;
        console.warn(`[TMP CLEANUP] Failed to inspect ${entryPath}:`, statErr.message);
        continue;
      }

      if (!purgeAll && now - stats.mtimeMs < maxAgeMs) {
        continue;
      }

      try {
        await fs.rm(entryPath, { recursive: true, force: true });
        removed += 1;
      } catch (rmErr) {
        console.warn(`[TMP CLEANUP] Failed to remove ${entryPath}:`, rmErr.message);
      }
    }
  } catch (readErr) {
    if (readErr.code !== "ENOENT") {
      console.warn(`[TMP CLEANUP] Failed to read ${dirPath}:`, readErr.message);
    }
  }

  if (removed > 0) {
    console.log(`[TMP CLEANUP] Removed ${removed} entries from ${path.basename(dirPath)} (purgeAll=${purgeAll}).`);
  }
}

export async function cleanupTemporaryArtifacts(options = {}) {
  const maxAgeMs = typeof options.maxAgeMs === "number" ? options.maxAgeMs : DEFAULT_MAX_AGE_MS;
  const purgeAll = Boolean(options.purgeAll);

  await cleanupDirectory(TMP_ROOT, { maxAgeMs, purgeAll });
  if (PDF_OUTPUT_DIR) {
    await cleanupDirectory(PDF_OUTPUT_DIR, { maxAgeMs, purgeAll });
  }
}
