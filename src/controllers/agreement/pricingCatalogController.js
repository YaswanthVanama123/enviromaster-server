/**
 * Pricing Catalog Controller
 * Handles pricing catalog PDF export
 */

import { ProductCatalog } from "../../models/product/index.js";
import { ServiceConfig } from "../../models/service/index.js";
import { compilePricingCatalogPdf } from "../../services/pdfService.js";

export async function exportPricingCatalog(req, res) {
  try {
    const serviceConfig = await ServiceConfig.findOne({ isActive: true }).lean();
    if (!serviceConfig) {
      return res.status(404).json({ success: false, error: "No active service configuration found" });
    }

    const catalog = await ProductCatalog.find({ isActive: true }).sort({ category: 1, name: 1 }).lean();
    if (!catalog || catalog.length === 0) {
      return res.status(404).json({ success: false, error: "No products found in catalog" });
    }

    const pdfBuffer = await compilePricingCatalogPdf({ catalog });

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="pricing-catalog.pdf"',
      'Content-Length': pdfBuffer.length.toString()
    });
    res.send(pdfBuffer);
  } catch (err) {
    console.error("exportPricingCatalog error:", err);
    res.status(500).json({ success: false, error: "Failed to export pricing catalog", detail: err?.message });
  }
}

export async function exportPricingCatalogFromDb(req, res) {
  try {
    const products = await ProductCatalog.find({ isActive: true }).sort({ category: 1, name: 1 }).lean();

    if (!products || products.length === 0) {
      return res.status(404).json({ success: false, error: "No products found" });
    }

    res.json({
      success: true,
      total: products.length,
      products: products.map(p => ({
        id: p._id,
        name: p.name,
        description: p.description,
        category: p.category,
        basePrice: p.basePrice,
        unit: p.unit,
        isActive: p.isActive
      }))
    });
  } catch (err) {
    console.error("exportPricingCatalogFromDb error:", err);
    res.status(500).json({ success: false, error: "Failed to export catalog from DB", detail: err?.message });
  }
}
