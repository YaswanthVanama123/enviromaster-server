import "dotenv/config";
import mongoose from "mongoose";
import { CustomerHeaderDoc } from "../src/models/index.js";
import { computeGlobalCommission } from "../src/shared/commission-engine/engine.mjs";

const QUOTA_COMMISSION_RATES = { below: 3, above: 6, double: 9 };
const MONEY_TOLERANCE = 1;
const RATE_TOLERANCE = 0.1;
const LIMIT = Number(process.env.PARITY_LIMIT || 300);

function close(a, b, tol) {
  return Math.abs((a || 0) - (b || 0)) <= tol;
}

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error("MONGO_URI not set");
    process.exit(1);
  }
  await mongoose.connect(uri, { dbName: process.env.MONGO_DB || "enviro_master" });

  const docs = await CustomerHeaderDoc.find({
    isDeleted: { $ne: true },
    "payload.commission": { $ne: null },
    "payload.commission.serviceBreakdown": { $exists: true },
  })
    .select("payload.services payload.accountTypeCache payload.summary payload.commission")
    .limit(LIMIT)
    .lean();

  let matched = 0;
  const mismatches = [];

  for (const doc of docs) {
    const saved = doc.payload?.commission;
    if (!saved) continue;

    const rules = saved.rulesSnapshot;
    if (!rules) continue;

    const quotaLevel = saved.breakdown?.quotaLevel || saved.input?.quotaLevel || "above";
    const baseRate = QUOTA_COMMISSION_RATES[quotaLevel] ?? 6;
    const isNewLocation = saved.isNewLocation ?? true;
    const priorQuotaCredit = typeof saved.priorQuotaCredit === "number" ? saved.priorQuotaCredit : 0;
    const contractMonths = Number(doc.payload?.summary?.contractMonths) || 12;

    const global = computeGlobalCommission(
      doc.payload?.services || {},
      doc.payload?.accountTypeCache || {},
      contractMonths,
      baseRate,
      rules,
      priorQuotaCredit,
      isNewLocation,
    );

    const annualOk = close(global.totalAnnualCommission, saved.annualCommission, MONEY_TOLERANCE);
    const weeklyOk = close(global.totalWeeklyCommission, saved.weeklyCommission, MONEY_TOLERANCE);
    const rateOk = close(global.effectiveCommissionRate, saved.finalCommissionRate, RATE_TOLERANCE);

    if (annualOk && weeklyOk && rateOk) {
      matched++;
    } else {
      mismatches.push({
        id: String(doc._id),
        savedAnnual: round(saved.annualCommission),
        engineAnnual: round(global.totalAnnualCommission),
        savedRate: round(saved.finalCommissionRate),
        engineRate: round(global.effectiveCommissionRate),
      });
    }
  }

  console.log(`\nParity over ${docs.length} agreements with saved commission:`);
  console.log(`  matched:    ${matched}`);
  console.log(`  mismatched: ${mismatches.length}`);
  if (mismatches.length) {
    console.log("\nSample mismatches (up to 15):");
    for (const m of mismatches.slice(0, 15)) console.log("  ", JSON.stringify(m));
  }

  await mongoose.disconnect();
  process.exit(mismatches.length ? 1 : 0);
}

function round(n) {
  return Math.round((n || 0) * 100) / 100;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
