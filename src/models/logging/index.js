/**
 * Logging Models - Index
 * Exports all logging/audit-related models
 */

import AuditLog, {
  AUDIT_ENTITIES,
  AUDIT_ACTIONS,
} from "./AuditLog.model.js";

import Log, {
  SAVE_ACTIONS,
  CHANGE_TYPES,
  PRODUCT_TYPES,
} from "./Log.model.js";

import BiginAuditLog from "./BiginAuditLog.model.js";
import PriceOverrideLog from "./PriceOverrideLog.model.js";
import VersionChangeLog from "./VersionChangeLog.model.js";

export {
  // Models
  AuditLog,
  Log,
  BiginAuditLog,
  PriceOverrideLog,
  VersionChangeLog,

  // Constants
  AUDIT_ENTITIES,
  AUDIT_ACTIONS,
  SAVE_ACTIONS,
  CHANGE_TYPES,
  PRODUCT_TYPES,
};

export default {
  AuditLog,
  Log,
  BiginAuditLog,
  PriceOverrideLog,
  VersionChangeLog,
};
