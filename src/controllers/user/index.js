/**
 * User Controllers - Index
 * Exports all user-related controller functions
 */

// Admin Authentication
export {
  adminLogin,
  changeAdminPassword,
  getAdminProfile,
  createAdminAccount,
  getAdminDashboard,
  getAdminRecentDocuments,
  getAdminDashboardStatusCounts,
  resetAdminPassword,
} from "./adminAuthController.js";

// Employee Authentication
export {
  employeeLogin,
  getEmployeeProfile,
  changeEmployeePassword,
} from "./employeeAuthController.js";

// User Management
export {
  listUsers,
  createAdmin,
  createEmployee,
  updateUser,
  toggleUserStatus,
  resetUserPassword,
  deleteUser,
} from "./userManagementController.js";

// User Service
export { createUser } from "./userController.js";
