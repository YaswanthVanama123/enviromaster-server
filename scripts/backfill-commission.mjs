import "dotenv/config";
import mongoose from "mongoose";
import { ZohoMapping } from "../src/models/index.js";
import { CompanyMapping } from "../src/models/customer/index.js";
import {
  recalcCommissionForAgreement,
  recalcCommissionForCompany,
} from "../src/services/commissionAutomation.js";

const arg = process.argv[2];

async function main() {
  if (!arg) {
    console.error("Usage:");
    console.error("  node scripts/backfill-commission.mjs <agreementId>   # one agreement");
    console.error("  node scripts/backfill-commission.mjs --all           # every mapped company");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI, {
    dbName: process.env.MONGO_DB || "enviro_master",
  });

  const results = [];

  if (arg === "--all") {
    const mapped = await CompanyMapping.find({
      mappingStatus: "mapped",
      routeStarId: { $ne: null },
    })
      .select("biginId biginCompanyName")
      .lean();

    console.log(`Found ${mapped.length} RouteStar-mapped companies.`);
    for (const cm of mapped) {
      const summary = await recalcCommissionForCompany(cm.biginId);
      for (const r of summary.results) results.push(r);
    }
  } else {
    const zoho = await ZohoMapping.findOne({ agreementId: arg })
      .select("zohoCompany.id")
      .lean();
    const companyId = zoho?.zohoCompany?.id || null;
    if (!companyId) {
      console.log(`Agreement ${arg} is not connected to a Bigin company (no ZohoMapping).`);
    } else {
      results.push(await recalcCommissionForAgreement(arg, companyId));
    }
  }

  const updated = results.filter((r) => r && !r.skipped);
  const skipped = results.filter((r) => r && r.skipped);

  console.log(`\nBackfill complete:`);
  console.log(`  updated: ${updated.length}`);
  console.log(`  skipped: ${skipped.length}`);
  for (const r of updated.slice(0, 30)) {
    console.log(`  ✓ ${r.agreementId}  annual=$${Math.round(r.annualCommission)}  rate=${r.finalCommissionRate?.toFixed(2)}%  quotaCredit=$${Math.round(r.quotaCredit)}  (${r.quotaLevel})`);
  }
  const reasons = {};
  for (const r of skipped) reasons[r.reason] = (reasons[r.reason] || 0) + 1;
  if (skipped.length) console.log(`  skip reasons:`, JSON.stringify(reasons));

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
