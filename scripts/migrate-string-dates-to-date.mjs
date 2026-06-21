#!/usr/bin/env node
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const APPLY = process.argv.includes("--apply");
const uri = process.env.MONGO_URI;
const dbName = process.env.MONGO_DB || "enviro_master";

if (!uri) {
  console.error("Missing MONGO_URI in environment (.env).");
  process.exit(1);
}

function toDate(value) {
  if (value == null) return { changed: false };
  if (value instanceof Date) return { changed: false };
  if (typeof value !== "string") return { changed: false };
  const trimmed = value.trim();
  if (trimmed === "") return { changed: true, value: null };
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return { changed: false, invalid: true, raw: value };
  return { changed: true, value: parsed };
}

async function run() {
  console.log(`Mode: ${APPLY ? "APPLY (writing changes)" : "DRY-RUN (no writes) — pass --apply to commit"}`);
  await mongoose.connect(uri, { dbName });
  console.log(`Connected to ${dbName}`);
  const db = mongoose.connection.db;

  const stats = { commissionrecords: 0, productcatalogs: 0, logsTimestamps: 0, invalid: [] };

  const crCursor = db.collection("commissionrecords").find(
    { "calculation.calculatedAt": { $type: "string" } },
    { projection: { "calculation.calculatedAt": 1 } }
  );
  for await (const doc of crCursor) {
    const res = toDate(doc.calculation?.calculatedAt);
    if (res.invalid) stats.invalid.push({ col: "commissionrecords", id: doc._id, field: "calculation.calculatedAt", raw: res.raw });
    if (!res.changed) continue;
    stats.commissionrecords++;
    if (APPLY) {
      await db.collection("commissionrecords").updateOne(
        { _id: doc._id },
        { $set: { "calculation.calculatedAt": res.value } }
      );
    }
  }

  const pcCursor = db.collection("productcatalogs").find(
    { lastUpdated: { $type: "string" } },
    { projection: { lastUpdated: 1 } }
  );
  for await (const doc of pcCursor) {
    const res = toDate(doc.lastUpdated);
    if (res.invalid) stats.invalid.push({ col: "productcatalogs", id: doc._id, field: "lastUpdated", raw: res.raw });
    if (!res.changed) continue;
    stats.productcatalogs++;
    if (APPLY) {
      await db.collection("productcatalogs").updateOne(
        { _id: doc._id },
        { $set: { lastUpdated: res.value } }
      );
    }
  }

  const arrays = ["changes", "currentChanges", "allPreviousChanges"];
  const logCursor = db.collection("logs").find(
    { $or: arrays.map((a) => ({ [`${a}.timestamp`]: { $type: "string" } })) },
    { projection: { changes: 1, currentChanges: 1, allPreviousChanges: 1 } }
  );
  for await (const doc of logCursor) {
    const setOps = {};
    for (const arr of arrays) {
      const list = doc[arr];
      if (!Array.isArray(list)) continue;
      list.forEach((item, i) => {
        const res = toDate(item?.timestamp);
        if (res.invalid) stats.invalid.push({ col: "logs", id: doc._id, field: `${arr}[${i}].timestamp`, raw: res.raw });
        if (res.changed) setOps[`${arr}.${i}.timestamp`] = res.value;
      });
    }
    const keys = Object.keys(setOps);
    if (keys.length === 0) continue;
    stats.logsTimestamps += keys.length;
    if (APPLY) {
      await db.collection("logs").updateOne({ _id: doc._id }, { $set: setOps });
    }
  }

  console.log("");
  console.log("Summary:");
  console.log(`  commissionrecords.calculation.calculatedAt: ${stats.commissionrecords}`);
  console.log(`  productcatalogs.lastUpdated:                 ${stats.productcatalogs}`);
  console.log(`  logs.*.timestamp (array entries):            ${stats.logsTimestamps}`);
  if (stats.invalid.length) {
    console.log("");
    console.log(`Unparseable string values left UNCHANGED (${stats.invalid.length}); review manually:`);
    stats.invalid.slice(0, 50).forEach((x) => console.log(`  [${x.col}] ${x.id} ${x.field} = ${JSON.stringify(x.raw)}`));
    if (stats.invalid.length > 50) console.log(`  ...and ${stats.invalid.length - 50} more`);
  }

  await mongoose.disconnect();
  console.log("");
  console.log(APPLY ? "Done. Changes applied." : "Dry-run complete. Re-run with --apply to write.");
}

run().catch(async (err) => {
  console.error("Migration failed:", err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
