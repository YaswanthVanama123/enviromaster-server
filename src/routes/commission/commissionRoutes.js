import { Router } from "express";
import { requireAdminAuth } from "../../middleware/adminAuth.js";
import { requireAuth } from "../../middleware/authMiddleware.js";
import {
  getActiveRules,
  getAllRules,
  updateRules,
  createRules,
  calculate,
  saveRecord,
  getRecords,
  getRecordById,
  updateRecordStatus,
  deleteRecord,
} from "../../controllers/commission/commissionController.js";

const router = Router();

// Commission Rules endpoints
router.get("/rules/active", getActiveRules);
router.get("/rules", requireAdminAuth, getAllRules);
router.put("/rules/:id", requireAdminAuth, updateRules);
router.post("/rules", requireAdminAuth, createRules);

// Commission Calculation endpoint
router.post("/calculate", calculate);

// Commission Records endpoints
router.post("/records", requireAuth, saveRecord);
router.get("/records", requireAuth, getRecords);
router.get("/records/:id", requireAuth, getRecordById);
router.patch("/records/:id/status", requireAdminAuth, updateRecordStatus);
router.delete("/records/:id", requireAdminAuth, deleteRecord);

export default router;
