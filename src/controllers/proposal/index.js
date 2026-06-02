/**
 * Proposal Controllers - Index
 * Exports all proposal-related controller functions
 */

// Proposal
export {
  createProposal,
  updateProposal,
  getProposalById,
  listProposals,
  getFormCatalog,
  attachPdfAndMarkForZoho,
} from "./proposalController.js";

// Catalog
export {
  getCatalog,
  updateCatalog,
} from "./catalogController.js";
