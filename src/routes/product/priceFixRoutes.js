import { Router } from "express";
import PricingChangeDetector from "../../middleware/pricingChangeDetector.js";
import { priceChangeWriteGuard } from "../../middleware/adminAuth.js";

import {
  createPriceFix,
  getAllPriceFixes,
  getPriceFixById,
  updatePriceFix,
} from "../../controllers/product/priceFixController.js";

const router = Router();

router.use(priceChangeWriteGuard);

router.post("/", createPriceFix);

router.get("/", getAllPriceFixes);

router.get("/:id", getPriceFixById);

router.put("/:id",
  PricingChangeDetector.beforePriceFixUpdate,
  PricingChangeDetector.addBackupInfoToResponse,
  updatePriceFix
);

export default router;
