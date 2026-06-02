import express from "express";
import multer from "multer";
import {
  uploadManualPdf,
  getManualUploads,
  getManualUploadById,
  downloadManualUpload,
  updateManualUploadStatus,
  deleteManualUpload,
} from "../../controllers/agreement/manualUploadController.js";

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are allowed"));
    }
  },
});

router.post("/", upload.single("file"), uploadManualPdf);

router.get("/", getManualUploads);

router.get("/:id", getManualUploadById);

router.get("/:id/download", downloadManualUpload);

router.patch("/:id/status", updateManualUploadStatus);

router.delete("/:id", deleteManualUpload);

export default router;
