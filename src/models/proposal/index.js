/**
 * Proposal Models - Index
 * Exports all proposal-related models
 */

import Proposal, { APPROVAL_STATUS, SYNC_STATUS } from "./Proposal.model.js";
import Catalog from "./Catalog.model.js";
import FileAsset, { FILE_KINDS, STORAGE_TYPES } from "./FileAsset.model.js";

export {
  // Models
  Proposal,
  Catalog,
  FileAsset,

  // Constants
  APPROVAL_STATUS,
  SYNC_STATUS,
  FILE_KINDS,
  STORAGE_TYPES,
};

export default {
  Proposal,
  Catalog,
  FileAsset,
};
