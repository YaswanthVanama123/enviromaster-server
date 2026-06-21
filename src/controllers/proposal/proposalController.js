import { Proposal, Catalog, FileAsset } from "../../models/proposal/index.js";
import { archiveOverflowAndTrim } from "../../utils/archiveOverflow.js";

const PROPOSAL_PDF_HISTORY_CAP = 10;
const PROPOSAL_CRM_ATTEMPTS_CAP = 20;

export const createProposal = async (req, res) => {
  try {
    const body = req.body || {};
    const doc = await Proposal.create({
      title: body.title || 'Untitled',
      publicRef: body.publicRef || undefined,
      customer: body.customer || { fields: [] },
      products: body.products || undefined,
      services: body.services || undefined,
      approval: {
        status: body.submit ? 'submitted' : 'draft',
        submittedAt: body.submit ? new Date() : undefined,
      },
      meta: body.meta || {},
    });
    return res.status(201).json({ ok: true, id: doc._id, ref: doc.publicRef });
  } catch (err) {
    console.error('createProposal error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};

export const updateProposal = async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body || {};
    const patch = {};

    if (body.title !== undefined) patch.title = body.title;
    if (body.customer !== undefined) patch.customer = body.customer;
    if (body.products !== undefined) patch.products = body.products;
    if (body.services !== undefined) patch.services = body.services;
    if (body.meta !== undefined) patch.meta = body.meta;
    if (body.submit) {
    patch.approval = {
        ...(patch.approval || {}),
        status: 'submitted',
        submittedAt: new Date(),
    };
    }


    const doc = await Proposal.findByIdAndUpdate(id, { $set: patch }, { new: true });
    if (!doc) return res.status(404).json({ ok: false, error: 'Proposal not found' });
    return res.json({ ok: true, id: doc._id });
  } catch (err) {
    console.error('updateProposal error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};

export const getProposalById = async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await Proposal.findById(id);
    if (!doc) return res.status(404).json({ ok: false, error: 'Proposal not found' });
    return res.json({ ok: true, data: doc });
  } catch (err) {
    console.error('getProposalById error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};

export const listProposals = async (_req, res) => {
  try {
    const docs = await Proposal.find(
      {},
      { title: 1, createdAt: 1, 'approval.status': 1 }
    )
      .sort({ createdAt: -1 })
      .limit(100);
    return res.json({ ok: true, data: docs });
  } catch (err) {
    console.error('listProposals error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};

export const getFormCatalog = async (_req, res) => {
  try {
    const cat = (await Catalog.findOne({ active: true })) || (await Catalog.findOne({}));
    if (!cat)
      return res.json({
        ok: true,
        data: { customer: { fields: [] }, products: null, services: null },
      });
    return res.json({ ok: true, data: cat.payload });
  } catch (err) {
    console.error('getFormCatalog error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};

export const attachPdfAndMarkForZoho = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      filename,
      contentType = 'application/pdf',
      size = 0,
      storage = {},
      htmlSnapshot = {},
      jsonSnapshot = {},
      versionTag = '',
    } = req.body;

    const asset = await FileAsset.create({
      kind: 'pdf',
      filename,
      contentType,
      size,
      storage,
      meta: {},
    });

    const pdfObj = {
      asset: asset._id,
      htmlSnapshot,
      jsonSnapshot,
      versionTag,
      createdAt: new Date(),
    };

    const doc = await Proposal.findByIdAndUpdate(
      id,
      {
        $set: {
          pdf: pdfObj,
          'crm.status': 'pending',
          'crm.lastError': '',
          'crm.lastSyncAt': null,
        },
        $push: {
          pdfHistory: pdfObj,
          'crm.attempts': {
            at: new Date(),
            status: 'queued',
            payload: jsonSnapshot,
          },
        },
      },
      { new: true }
    );

    if (!doc)
      return res.status(404).json({ ok: false, error: 'Proposal not found' });

    const archiveRef = { proposalId: doc._id };
    await archiveOverflowAndTrim({
      parentModelName: 'Proposal',
      parentId: doc._id,
      archiveModelName: 'ProposalHistoryArchive',
      baseRef: archiveRef,
      doc,
      field: 'pdfHistory',
      cap: PROPOSAL_PDF_HISTORY_CAP,
    });
    await archiveOverflowAndTrim({
      parentModelName: 'Proposal',
      parentId: doc._id,
      archiveModelName: 'ProposalHistoryArchive',
      baseRef: archiveRef,
      doc,
      field: 'crm.attempts',
      cap: PROPOSAL_CRM_ATTEMPTS_CAP,
    });

    return res.json({ ok: true, pdfAssetId: asset._id });
  } catch (err) {
    console.error('attachPdfAndMarkForZoho error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
