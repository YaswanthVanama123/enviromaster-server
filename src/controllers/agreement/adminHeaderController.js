/**
 * Admin Header Controller
 * Handles admin header document CRUD operations
 */

import { compileCustomerHeader } from "../../services/pdfService.js";
import { AdminHeaderDoc } from "../../models/agreement/index.js";
import { ServiceConfig } from "../../models/service/index.js";

export async function compileAndStoreAdminHeader(req, res) {
  try {
    const body = req.body || {};
    const { buffer, filename } = await compileCustomerHeader(body);

    const doc = await AdminHeaderDoc.create({
      headerTitle: body.headerTitle || "",
      headerRows: body.headerRows || [],
      products: body.products || {},
      services: body.services || {},
      agreement: {
        enviroOf: body.agreement?.enviroOf || "",
        customerExecutedOn: body.agreement?.customerExecutedOn || "",
        additionalMonths: body.agreement?.additionalMonths || "",
      },
      pdfMeta: {
        sizeBytes: buffer.length,
        contentType: "application/pdf",
        storedAt: new Date(),
        externalUrl: null,
      },
      status: body.status || "saved",
      createdBy: req.user?.username || req.admin?.username || req.admin?.id || null,
      updatedBy: req.user?.username || req.admin?.username || req.admin?.id || null,
      label: body.label || "",
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    res.setHeader("X-AdminHeaderDoc-Id", doc._id.toString());
    res.send(buffer);
  } catch (err) {
    console.error("compileAndStoreAdminHeader error:", err);
    res.status(500).json({
      error: "LaTeX compilation failed",
      detail: err?.detail || String(err),
    });
  }
}

export async function getAdminHeaders(req, res) {
  try {
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(
      Math.max(parseInt(req.query.limit || "20", 10), 1),
      100
    );

    const filter = {};
    const total = await AdminHeaderDoc.countDocuments(filter).exec();
    const items = await AdminHeaderDoc.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean()
      .exec();

    res.json({ total, page, limit, items });
  } catch (err) {
    console.error("getAdminHeaders error:", err);
    res.status(500).json({ error: "Failed to fetch docs", detail: String(err) });
  }
}

export async function getAdminHeaderById(req, res) {
  try {
    const { id } = req.params;
    const doc = await AdminHeaderDoc.findById(id).lean().exec();
    if (!doc) {
      return res.status(404).json({ error: "Not found", detail: "AdminHeaderDoc not found" });
    }

    const activeServices = await ServiceConfig.find({
      isActive: true,
      adminByDisplay: { $ne: false }
    })
    .select('serviceId label description tags')
    .lean()
    .exec();

    const serviceMetadata = activeServices.map(service => ({
      serviceId: service.serviceId,
      label: service.label,
      description: service.description,
      tags: service.tags || []
    }));

    res.json({
      ...doc,
      availableServices: serviceMetadata
    });
  } catch (err) {
    console.error("getAdminHeaderById error:", err);
    res.status(500).json({ error: "Failed to fetch doc", detail: String(err) });
  }
}

function applyFieldUpdates(doc, body) {
  if (body.headerTitle !== undefined) doc.headerTitle = body.headerTitle;
  if (body.headerRows !== undefined) doc.headerRows = body.headerRows;
  if (body.products !== undefined) doc.products = body.products;
  if (body.services !== undefined) doc.services = body.services;
  if (body.status !== undefined) doc.status = body.status;
  if (body.label !== undefined) doc.label = body.label;

  if (body.agreement !== undefined) {
    doc.agreement = {
      enviroOf: body.agreement.enviroOf ?? doc.agreement?.enviroOf ?? "",
      customerExecutedOn: body.agreement.customerExecutedOn ?? doc.agreement?.customerExecutedOn ?? "",
      additionalMonths: body.agreement.additionalMonths ?? doc.agreement?.additionalMonths ?? "",
    };
  }
}

async function compilePdfIfNeeded(doc, recompile) {
  if (!recompile) return { buffer: null, filename: "admin-header.pdf" };

  const { buffer, filename } = await compileCustomerHeader({
    headerTitle: doc.headerTitle,
    headerRows: doc.headerRows,
    products: doc.products,
    services: doc.services,
    agreement: doc.agreement,
  });

  doc.pdfMeta = {
    sizeBytes: buffer.length,
    contentType: "application/pdf",
    storedAt: new Date(),
    externalUrl: doc.pdfMeta?.externalUrl || null,
  };

  return { buffer, filename };
}

function sendResponse(res, doc, buffer, filename) {
  if (buffer) {
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    res.setHeader("X-AdminHeaderDoc-Id", doc._id.toString());
    return res.send(buffer);
  }

  return res.json({
    success: true,
    doc: {
      _id: doc._id,
      status: doc.status,
      updatedAt: doc.updatedAt
    }
  });
}

export async function updateAdminHeader(req, res) {
  try {
    const { id } = req.params;
    const body = req.body || {};
    const recompile = req.query.recompile === "true";

    const doc = await AdminHeaderDoc.findById(id).exec();
    if (!doc) {
      return res.status(404).json({ error: "Not found", detail: "AdminHeaderDoc not found" });
    }

    applyFieldUpdates(doc, body);
    doc.updatedBy = req.user?.username || req.admin?.username || doc.updatedBy;

    const { buffer, filename } = await compilePdfIfNeeded(doc, recompile);
    await doc.save();

    return sendResponse(res, doc, buffer, filename);
  } catch (err) {
    console.error("updateAdminHeader error:", err);
    res.status(500).json({
      error: "Failed to update admin header",
      detail: err?.detail || String(err),
    });
  }
}
