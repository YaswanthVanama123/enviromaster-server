/**
 * Agreement Models - Index
 * Exports all agreement/document-related models
 */

import CustomerHeaderDoc, { DOCUMENT_STATUS } from "./CustomerHeaderDoc.model.js";
import VersionPdf, { VERSION_STATUS, CREATION_REASON } from "./VersionPdf.model.js";
import ManualUploadDocument, { UPLOAD_STATUS } from "./ManualUploadDocument.model.js";
import AdminHeaderDoc from "./AdminHeaderDoc.model.js";
import SignatureRequest, {
  SIGNATURE_REQUEST_STATUS,
  SIGNER_STATUS,
  SIGNATURE_METHOD,
  SIGNED_VIA,
  SIGNER_ROLE,
} from "./SignatureRequest.model.js";

export {
  // Models
  CustomerHeaderDoc,
  VersionPdf,
  ManualUploadDocument,
  AdminHeaderDoc,
  SignatureRequest,

  // Constants
  DOCUMENT_STATUS,
  VERSION_STATUS,
  CREATION_REASON,
  UPLOAD_STATUS,
  SIGNATURE_REQUEST_STATUS,
  SIGNER_STATUS,
  SIGNATURE_METHOD,
  SIGNED_VIA,
  SIGNER_ROLE,
};

export default {
  CustomerHeaderDoc,
  VersionPdf,
  ManualUploadDocument,
  AdminHeaderDoc,
  SignatureRequest,
};
