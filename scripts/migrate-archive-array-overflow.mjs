#!/usr/bin/env node
import mongoose from "mongoose";
import dotenv from "dotenv";
import {
  ZohoMapping,
  ZohoUploadArchive,
  Proposal,
  ProposalHistoryArchive,
} from "../src/models/index.js";

dotenv.config();

const APPLY = process.argv.includes("--apply");
const uri = process.env.MONGO_URI;
const dbName = process.env.MONGO_DB || "enviro_master";

if (!uri) {
  console.error("Missing MONGO_URI in environment (.env).");
  process.exit(1);
}

const CAPS = {
  zoho: { uploads: 50, failedUploads: 50 },
  proposal: { pdfHistory: 10, "crm.attempts": 20 },
};

function readPath(doc, field) {
  return field.split(".").reduce((o, k) => (o == null ? o : o[k]), doc);
}

function toPlain(entry) {
  return entry && typeof entry.toObject === "function" ? entry.toObject() : entry;
}

async function run() {
  console.log(`Mode: ${APPLY ? "APPLY (writing changes)" : "DRY-RUN (no writes) — pass --apply to commit"}`);
  await mongoose.connect(uri, { dbName });
  console.log(`Connected to ${dbName}`);

  const stats = { "zoho.uploads": 0, "zoho.failedUploads": 0, "proposal.pdfHistory": 0, "proposal.crm.attempts": 0 };

  for await (const m of ZohoMapping.find().cursor()) {
    for (const [field, cap] of Object.entries(CAPS.zoho)) {
      const arr = m[field] || [];
      if (arr.length <= cap) continue;
      const overflow = arr.slice(0, arr.length - cap);
      stats[`zoho.${field}`] += overflow.length;
      if (APPLY) {
        await ZohoUploadArchive.insertMany(
          overflow.map((entry) => ({ mappingId: m._id, agreementId: m.agreementId, field, entry: toPlain(entry) })),
          { ordered: false }
        );
        await ZohoMapping.updateOne({ _id: m._id }, { $push: { [field]: { $each: [], $slice: -cap } } });
      }
    }
  }

  for await (const p of Proposal.find().cursor()) {
    for (const [field, cap] of Object.entries(CAPS.proposal)) {
      const arr = readPath(p, field) || [];
      if (arr.length <= cap) continue;
      const overflow = arr.slice(0, arr.length - cap);
      stats[`proposal.${field}`] += overflow.length;
      if (APPLY) {
        await ProposalHistoryArchive.insertMany(
          overflow.map((entry) => ({ proposalId: p._id, field, entry: toPlain(entry) })),
          { ordered: false }
        );
        await Proposal.updateOne({ _id: p._id }, { $push: { [field]: { $each: [], $slice: -cap } } });
      }
    }
  }

  console.log("");
  console.log("Entries archived (or, in dry-run, that WOULD be archived):");
  for (const [k, v] of Object.entries(stats)) console.log(`  ${k}: ${v}`);

  await mongoose.disconnect();
  console.log("");
  console.log(APPLY ? "Done. Overflow archived and live arrays trimmed." : "Dry-run complete. Re-run with --apply to write.");
}

run().catch(async (err) => {
  console.error("Migration failed:", err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
