/**
 * User Models - Index
 * Exports all user-related models
 */

import AdminUser from "./AdminUser.model.js";
import Employee, { SALES_ROLES, QUOTA_PERIOD_TYPES } from "./Employee.model.js";

export {
  // Models
  AdminUser,
  Employee,

  // Constants
  SALES_ROLES,
  QUOTA_PERIOD_TYPES,
};

export default {
  AdminUser,
  Employee,
};
