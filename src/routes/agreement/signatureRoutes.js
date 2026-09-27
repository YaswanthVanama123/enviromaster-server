import { Router } from "express";
import {
  requireAuth,
  requireAuthAllowQueryToken,
} from "../../middleware/authMiddleware.js";
import {
  listSignatureRequests,
  getSignatureRequest,
  syncToLatestVersion,
  addSigner,
  updateSigner,
  removeSigner,
  sendSignerInvite,
  createSignerLink,
  revokeSignerLink,
  signInPerson,
  resetSigner,
  getSignerImage,
  downloadSignedPdf,
  regenerateSignedPdf,
  downloadPublicSignedPdf,
  getPublicSigningContext,
  downloadPublicPdf,
  signWithToken,
  declineWithToken,
} from "../../controllers/agreement/signatureController.js";

const router = Router();

router.get("/public/:token", getPublicSigningContext);
router.get("/public/:token/pdf", downloadPublicPdf);
router.post("/public/:token/sign", signWithToken);
router.post("/public/:token/decline", declineWithToken);
router.get("/public/:token/signed-pdf", downloadPublicSignedPdf);

router.get("/", requireAuth, listSignatureRequests);

router.get("/agreement/:agreementId", requireAuth, getSignatureRequest);
router.post("/agreement/:agreementId/sync-version", requireAuth, syncToLatestVersion);
router.post("/agreement/:agreementId/signers", requireAuth, addSigner);
router.patch("/agreement/:agreementId/signers/:signerId", requireAuth, updateSigner);
router.delete("/agreement/:agreementId/signers/:signerId", requireAuth, removeSigner);
router.post(
  "/agreement/:agreementId/signers/:signerId/invite",
  requireAuth,
  sendSignerInvite
);
router.post(
  "/agreement/:agreementId/signers/:signerId/link",
  requireAuth,
  createSignerLink
);
router.post(
  "/agreement/:agreementId/signers/:signerId/revoke-link",
  requireAuth,
  revokeSignerLink
);
router.post("/agreement/:agreementId/signers/:signerId/sign", requireAuth, signInPerson);
router.post("/agreement/:agreementId/signers/:signerId/reset", requireAuth, resetSigner);
router.get(
  "/agreement/:agreementId/signers/:signerId/image",
  requireAuthAllowQueryToken,
  getSignerImage
);
router.get(
  "/agreement/:agreementId/signed-pdf",
  requireAuthAllowQueryToken,
  downloadSignedPdf
);
router.post("/agreement/:agreementId/finalize", requireAuth, regenerateSignedPdf);

export default router;
