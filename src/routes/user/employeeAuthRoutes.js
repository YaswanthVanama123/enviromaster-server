import { Router } from "express";
import {
  employeeLogin,
  getEmployeeProfile,
  changeEmployeePassword,
} from "../../controllers/user/employeeAuthController.js";
import { requireAuth } from "../../middleware/authMiddleware.js";

const router = Router();

// Public routes
router.post("/login", employeeLogin);

// Protected routes (require employee or admin auth)
router.get("/me", requireAuth, getEmployeeProfile);
router.post("/change-password", requireAuth, changeEmployeePassword);

export default router;
