import { BiginCompany } from "#models/customer/index.js";
import { getBiginDealsByCompany } from "./zohoService.js";

export async function determineLocationType(biginId) {
  const result = await getBiginDealsByCompany(biginId, 1, 200);
  if (!result.success) {
    return { success: false, biginId, error: result.error };
  }
  const dealCount = result.pagination?.total ?? result.deals.length;
  return { success: true, biginId, dealCount, isExistingLocation: dealCount > 1 };
}

export async function refreshLocationTypeForCompany(biginId) {
  const r = await determineLocationType(biginId);
  if (!r.success) return r;
  await BiginCompany.updateOne(
    { biginId: String(biginId) },
    { $set: { isExistingLocation: r.isExistingLocation, locationTypeCheckedAt: new Date() } },
  );
  return r;
}

export async function refreshPendingLocationTypes(limit = 200, onProgress) {
  const companies = await BiginCompany.find({ isExistingLocation: { $ne: true } })
    .select("biginId companyName")
    .limit(limit)
    .lean();

  const total = companies.length;
  let processed = 0;
  let markedExisting = 0;
  let failed = 0;
  const report = () => {
    if (typeof onProgress === "function") onProgress({ total, processed, markedExisting, failed });
  };
  report();

  for (const company of companies) {
    if (!company.biginId) {
      processed++;
      report();
      continue;
    }
    const r = await refreshLocationTypeForCompany(company.biginId);
    processed++;
    if (r.success && r.isExistingLocation) markedExisting++;
    if (!r.success) failed++;
    report();
  }

  return { checked: total, markedExisting, failed };
}

export default { determineLocationType, refreshLocationTypeForCompany, refreshPendingLocationTypes };
