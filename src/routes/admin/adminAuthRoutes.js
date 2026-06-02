import { Router } from "express";
import {
  adminLogin,
  changeAdminPassword,
  getAdminProfile,
  createAdminAccount,
  getAdminDashboard,
  getAdminRecentDocuments,
  getAdminDashboardStatusCounts,
  resetAdminPassword,
} from "../../controllers/user/adminAuthController.js";
import { requireAdminAuth } from "../../middleware/adminAuth.js";

const router = Router();

router.post("/login", adminLogin);
router.post("/reset-password", resetAdminPassword);

router.get("/me", requireAdminAuth, getAdminProfile);
router.post("/change-password", requireAdminAuth, changeAdminPassword);
router.post("/create", createAdminAccount);

router.get("/dashboard", requireAdminAuth, getAdminDashboard);
router.get("/recent-documents", requireAdminAuth, getAdminRecentDocuments);
router.get("/dashboard/status-counts", requireAdminAuth, getAdminDashboardStatusCounts);

export default router;
