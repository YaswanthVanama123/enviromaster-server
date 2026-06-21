import mongoose from "mongoose";

const ProposalHistoryArchiveSchema = new mongoose.Schema(
  {
    proposalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Proposal",
      required: true,
    },
    field: {
      type: String,
      enum: ["pdfHistory", "crm.attempts"],
      required: true,
    },
    entry: { type: mongoose.Schema.Types.Mixed, required: true },
    archivedAt: { type: Date, default: Date.now },
  },
  { collection: "proposal_history_archive" }
);

ProposalHistoryArchiveSchema.index({ proposalId: 1, field: 1, archivedAt: -1 });

const ProposalHistoryArchive = mongoose.model(
  "ProposalHistoryArchive",
  ProposalHistoryArchiveSchema
);

export default ProposalHistoryArchive;
