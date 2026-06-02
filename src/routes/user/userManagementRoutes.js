import { Router } from "express";
import {
  listUsers,
  createAdmin,
  createEmployee,
  updateUser,
  toggleUserStatus,
  resetUserPassword,
  deleteUser,
} from "../../controllers/user/userManagementController.js";
import { requireAdmin } from "../../middleware/authMiddleware.js";

const router = Router();

// All routes require admin authentication
router.use(requireAdmin);

// List all users
router.get("/", listUsers);

// Create users
router.post("/admin", createAdmin);
router.post("/employee", createEmployee);

// Update user
router.put("/:type/:id", updateUser);

// Toggle user status (activate/deactivate)
router.patch("/:type/:id/status", toggleUserStatus);

// Reset user password
router.patch("/:type/:id/reset-password", resetUserPassword);

// Delete user
router.delete("/:type/:id", deleteUser);

export default router;
