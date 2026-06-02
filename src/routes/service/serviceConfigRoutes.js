import express from "express";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import * as serviceConfigController from "../../controllers/service/serviceConfigController.js";
import PricingChangeDetector from "../../middleware/pricingChangeDetector.js";

const router = express.Router();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, "../../../../uploads/service-images");

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `svc-${Date.now()}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error("Only image files are allowed."));
  },
});

router.post(
  "/",

  serviceConfigController.createServiceConfigController
);

router.get(
  "/",
  serviceConfigController.getAllServiceConfigsController
);

router.get(
  "/active",
  serviceConfigController.getActiveServiceConfigsController
);

router.get(
  "/pricing",
  serviceConfigController.getAllServicePricingController
);

router.get(
  "/service/:serviceId/latest",
  serviceConfigController.getLatestConfigForServiceController
);

router.get(
  "/:id",
  serviceConfigController.getServiceConfigByIdController
);

router.put(
  "/:id",
  PricingChangeDetector.beforeServiceConfigUpdate,
  PricingChangeDetector.addBackupInfoToResponse,
  serviceConfigController.replaceServiceConfigController
);

router.put(
  "/:id/partial",
  PricingChangeDetector.beforeServiceConfigUpdate,
  PricingChangeDetector.addBackupInfoToResponse,
  serviceConfigController.partialUpdateServiceConfigController
);

router.delete(
  "/:id",
  serviceConfigController.deleteServiceConfigController
);

router.delete(
  "/service/:serviceId",
  serviceConfigController.deleteServiceConfigsByServiceIdController
);

router.post(
  "/:id/upload-image",
  upload.single("image"),
  serviceConfigController.uploadServiceImageController
);

export default router;
