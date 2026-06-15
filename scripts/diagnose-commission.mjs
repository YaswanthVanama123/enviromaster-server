import "dotenv/config";
import mongoose from "mongoose";
import { CustomerHeaderDoc, ZohoMapping } from "../src/models/index.js";
import { CompanyMapping } from "../src/models/customer/index.js";
import { computeCommissionForDoc } from "../src/services/commissionAutomation.js";

const agreementId = process.argv[2];

async function main() {
  if (!agreementId) {
    console.error("Usage: node scripts/diagnose-commission.mjs <agreementId>");
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI, {
    dbName: process.env.MONGO_DB || "enviro_master",
  });

  console.log("\n================ COMMISSION DIAGNOSIS ================");
  console.log("agreementId:", agreementId);

  const doc = await CustomerHeaderDoc.findById(agreementId);
  if (!doc) {
    console.log("❌ CustomerHeaderDoc NOT FOUND");
    return done();
  }
  console.log("✓ doc found. title:", doc.payload?.headerTitle, "| createdBy:", doc.createdBy, "| status:", doc.status, "| isDeleted:", doc.isDeleted);

  const zoho = await ZohoMapping.findOne({ agreementId }).lean();
  console.log("\n-- ZohoMapping (agreement <-> Bigin company) --");
  if (!zoho) {
    console.log("❌ NO ZohoMapping for this agreement → agreement is NOT connected to Bigin.");
  } else {
    console.log("✓ zohoCompany.id:", zoho.zohoCompany?.id, "| name:", zoho.zohoCompany?.name);
  }

  const companyId = zoho?.zohoCompany?.id || null;

  console.log("\n-- CompanyMapping (Bigin company <-> RouteStar) --");
  if (!companyId) {
    console.log("⚠ no companyId to look up (agreement not connected).");
  } else {
    const cm = await CompanyMapping.findOne({ biginId: String(companyId) }).lean();
    if (!cm) {
      console.log(`❌ NO CompanyMapping with biginId=${companyId}.`);
      console.log("   → The Bigin company id used on the agreement does NOT match any CompanyMapping.biginId.");
      const sample = await CompanyMapping.find({ mappingStatus: "mapped" }).select("biginId biginCompanyName routeStarId").limit(5).lean();
      console.log("   Sample mapped CompanyMappings (biginId values):", JSON.stringify(sample));
    } else {
      console.log("✓ CompanyMapping found. biginId:", cm.biginId, "| status:", cm.mappingStatus, "| routeStarId:", cm.routeStarId, "| name:", cm.biginCompanyName);
      const mapped = !!(cm.routeStarId && cm.mappingStatus === "mapped");
      console.log(mapped ? "✓ company IS RouteStar-mapped" : "❌ company is NOT RouteStar-mapped (routeStarId/status)");
    }
  }

  console.log("\n-- payload.services shape (what the engine reads) --");
  const payloadPlain =
    doc.payload && typeof doc.payload.toObject === "function"
      ? doc.payload.toObject()
      : doc.payload || {};
  const services = payloadPlain.services || {};
  let active = 0;
  for (const [name, sd] of Object.entries(services)) {
    if (!sd || typeof sd !== "object") continue;
    if (sd.isActive === false || sd.isActive === undefined) continue;
    active++;
    console.log(
      `  ${name}: isActive=${sd.isActive} contractTotal=${sd.contractTotal} originalContractTotal=${sd.originalContractTotal} totals.contract=${sd.totals?.contract?.amount} frequency=${JSON.stringify(sd.frequency)}`,
    );
  }
  console.log(`  active services with data: ${active}`);

  console.log("\n-- RAW shape of each populated service (top-level keys + candidate fields) --");
  for (const [name, sd] of Object.entries(services)) {
    if (!sd || typeof sd !== "object") continue;
    const keys = Object.keys(sd);
    if (keys.length === 0) continue;
    console.log(`\n  [${name}] keys: ${JSON.stringify(keys)}`);
    console.log(
      `    isActive=${sd.isActive} isUsed=${sd.isUsed} used=${sd.used} enabled=${sd.enabled} ` +
        `contractTotal=${sd.contractTotal} originalContractTotal=${sd.originalContractTotal} ` +
        `monthlyTotal=${sd.monthlyTotal} perVisit=${sd.perVisit} totalPrice=${sd.totalPrice}`,
    );
    if (sd.totals) console.log(`    totals=${JSON.stringify(sd.totals)}`);
    if (sd.frequency !== undefined) console.log(`    frequency=${JSON.stringify(sd.frequency)}`);
    if (sd.calc) console.log(`    calc=${JSON.stringify(sd.calc).slice(0, 300)}`);
  }

  console.log("\n  accountTypeCache keys:", Object.keys(payloadPlain.accountTypeCache || {}));
  console.log("  summary.contractMonths:", payloadPlain.summary?.contractMonths, "| summary.quotaCredit:", payloadPlain.summary?.quotaCredit);

  console.log("\n-- engine dry-run (computeCommissionForDoc, no save) --");
  try {
    const r = await computeCommissionForDoc(doc);
    if (!r.commission) {
      console.log("❌ engine returned NO commission. quotaLevel:", r.quotaLevel, "| serviceCount:", r.global?.serviceCount);
      console.log("   → likely the services above are missing contractTotal / not active.");
    } else {
      console.log("✓ engine computed:");
      console.log("   annualCommission:", r.commission.annualCommission);
      console.log("   finalCommissionRate:", r.commission.finalCommissionRate);
      console.log("   quotaCredit:", r.quotaCredit, "| priorQuotaCredit:", r.priorQuotaCredit, "| quotaLevel:", r.quotaLevel);
    }
  } catch (e) {
    console.log("❌ engine threw:", e.message);
  }

  console.log("\n-- current saved payload.commission --");
  console.log(doc.payload?.commission ? "present" : "null (not yet calculated)");

  console.log("=====================================================\n");
  return done();
}

function done() {
  return mongoose.disconnect().then(() => process.exit(0));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
