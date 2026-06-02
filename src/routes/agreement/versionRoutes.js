import { Router } from "express";
import { requireAuth } from "../../middleware/authMiddleware.js";
import {
  getAllVersionPdfs,
  getVersionPdfById,
  updateVersionStatus,
  downloadVersionPdf,
  deleteVersionPdf,
  checkVersionStatus,
  createVersion,
  replaceMainPdf,
  getVersionsList,
  getVersionForEdit,
  viewVersionPdf
} from "../../controllers/agreement/versionController.js";

const router = Router();

router.get("/", getAllVersionPdfs);

router.get("/:id", getVersionPdfById);

router.patch("/:id/status", updateVersionStatus);

router.get("/:id/download", downloadVersionPdf);

router.delete("/:id", deleteVersionPdf);

router.get("/:agreementId/check-status", checkVersionStatus);

router.post("/:agreementId/create-version", requireAuth, createVersion);

router.post("/:agreementId/replace-main", requireAuth, replaceMainPdf);

router.get("/:agreementId/list", getVersionsList);

router.get("/version/:versionId/view", viewVersionPdf);

router.get("/version/:versionId/download", (req, res, next) => {
  req.params.id = req.params.versionId;
  downloadVersionPdf(req, res, next);
});

router.delete("/version/:versionId", (req, res, next) => {
  req.params.id = req.params.versionId;
  deleteVersionPdf(req, res, next);
});

router.get("/version/:versionId/edit-format", getVersionForEdit);

export default router;
