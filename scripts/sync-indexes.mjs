#!/usr/bin/env node
import mongoose from "mongoose";
import dotenv from "dotenv";
import "../src/models/index.js";

dotenv.config();

const APPLY = process.argv.includes("--apply");
const uri = process.env.MONGO_URI;
const dbName = process.env.MONGO_DB || "enviro_master";

if (!uri) {
  console.error("Missing MONGO_URI in environment (.env).");
  process.exit(1);
}

async function run() {
  console.log(`Mode: ${APPLY ? "APPLY (creating/dropping indexes)" : "DRY-RUN (no writes) — pass --apply to commit"}`);
  await mongoose.connect(uri, { dbName });
  console.log(`Connected to ${dbName}`);

  const names = Object.keys(mongoose.models).sort();
  let toCreateTotal = 0;
  let toDropTotal = 0;

  for (const name of names) {
    const Model = mongoose.models[name];
    try {
      if (APPLY) {
        const dropped = await Model.syncIndexes();
        if (Array.isArray(dropped) && dropped.length) {
          console.log(`  ${name}: dropped [${dropped.join(", ")}], created any missing`);
          toDropTotal += dropped.length;
        }
      } else {
        const diff = await Model.diffIndexes();
        const create = diff.toCreate || [];
        const drop = diff.toDrop || [];
        if (create.length || drop.length) {
          console.log(`  ${name}:`);
          if (create.length) console.log(`    + create: ${JSON.stringify(create)}`);
          if (drop.length) console.log(`    - drop:   ${JSON.stringify(drop)}`);
          toCreateTotal += create.length;
          toDropTotal += drop.length;
        }
      }
    } catch (e) {
      console.error(`  ${name}: ERROR ${e.message}`);
    }
  }

  console.log("");
  if (APPLY) {
    console.log("syncIndexes complete for all models.");
  } else {
    console.log(`Dry-run summary: ${toCreateTotal} index(es) to create, ${toDropTotal} to drop.`);
    console.log("WARNING: applying drops ANY DB index not defined in a schema (incl. manually-created ones). Review the drop list above before --apply.");
    console.log("Re-run with --apply to commit.");
  }

  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error("Index sync failed:", err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
