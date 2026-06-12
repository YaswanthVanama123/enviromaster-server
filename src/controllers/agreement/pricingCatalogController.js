/**
 * Pricing Catalog Controller
 * Handles pricing catalog PDF export (compiled on the LaTeX server)
 */

import { ProductCatalog } from "../../models/product/index.js";
import { ServiceConfig } from "../../models/service/index.js";
import { compilePricingCatalogPdf } from "../../services/pdfService.js";

async function generateAndSendPricingPdf(res) {
  const services = await ServiceConfig.find({ isActive: true }).lean();
  const catalog = await ProductCatalog.findOne({ isActive: true }).lean();

  const hasServices = Array.isArray(services) && services.length > 0;
  const hasProducts = catalog && Array.isArray(catalog.families) &&
    catalog.families.some(f => f.products && f.products.length > 0);

  if (!hasServices && !hasProducts) {
    return res.status(404).json({ success: false, error: "No pricing data found to export" });
  }

  const { buffer, filename } = await compilePricingCatalogPdf({ services: services || [], catalog });

  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Content-Length': buffer.length.toString(),
  });
  return res.send(buffer);
}

export async function exportPricingCatalog(req, res) {
  try {
    return await generateAndSendPricingPdf(res);
  } catch (err) {
    console.error("exportPricingCatalog error:", err);
    res.status(500).json({ success: false, error: "Failed to export pricing catalog", detail: err?.message });
  }
}

export async function exportPricingCatalogFromDb(req, res) {
  try {
    return await generateAndSendPricingPdf(res);
  } catch (err) {
    console.error("exportPricingCatalogFromDb error:", err);
    res.status(500).json({ success: false, error: "Failed to export pricing catalog", detail: err?.message });
  }
}
