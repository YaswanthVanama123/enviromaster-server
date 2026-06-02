/**
 * Agreement Models - Index
 * Exports all agreement/document-related models
 */

import CustomerHeaderDoc, { DOCUMENT_STATUS } from "./CustomerHeaderDoc.model.js";
import VersionPdf, { VERSION_STATUS, CREATION_REASON } from "./VersionPdf.model.js";
import ManualUploadDocument, { UPLOAD_STATUS } from "./ManualUploadDocument.model.js";
import AdminHeaderDoc from "./AdminHeaderDoc.model.js";

export {
  // Models
  CustomerHeaderDoc,
  VersionPdf,
  ManualUploadDocument,
  AdminHeaderDoc,

  // Constants
  DOCUMENT_STATUS,
  VERSION_STATUS,
  CREATION_REASON,
  UPLOAD_STATUS,
};

export default {
  CustomerHeaderDoc,
  VersionPdf,
  ManualUploadDocument,
  AdminHeaderDoc,
};
