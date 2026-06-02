/**
 * Models - Central Index
 *
 * Organized export of all models by domain.
 * Import from specific domain for tree-shaking, or from here for convenience.
 *
 * @example
 * // Import specific domain
 * import { AdminUser, Employee } from './models/user';
 * import { RouteStarCustomer } from './models/customer';
 *
 * // Import from central index
 * import { AdminUser, RouteStarCustomer, ProductCatalog } from './models';
 */

// ============================================================
// USER MODELS
// ============================================================
export {
  AdminUser,
  Employee,
  SALES_ROLES,
  QUOTA_PERIOD_TYPES,
} from "./user/index.js";

// ============================================================
// CUSTOMER MODELS
// ============================================================
export {
  RouteStarCustomer,
  BiginCompany,
  CompanyMapping,
  CUSTOMER_STATUS,
  BIGIN_STAGES,
  MAPPING_STATUS,
} from "./customer/index.js";

// ============================================================
// PRODUCT MODELS
// ============================================================
export {
  ProductCatalog,
  PriceFix,
  PriceFixItem,
  PRODUCT_KINDS,
  BILLING_PERIODS,
  PRICE_CATEGORIES,
} from "./product/index.js";

// ============================================================
// SERVICE MODELS
// ============================================================
export {
  ServiceConfig,
  EmailTemplate,
  ServiceAgreementTemplate,
  SERVICE_IDS,
} from "./service/index.js";

// ============================================================
// COMMISSION MODELS
// ============================================================
export {
  CommissionRules,
  CommissionRecord,
  SalesPerson,
  Agreement,
  QuotaPeriod,
  QUOTA_LEVELS,
  AGREEMENT_TERMS,
  ACCOUNT_TYPES,
  PRICING_LINES,
  BUSINESS_TYPES,
  DEFAULT_COMMISSION_RULES,
  COMMISSION_RECORD_STATUS,
  SALES_PERSON_ROLES,
  AGREEMENT_STATUS,
  QUOTA_PERIOD_STATUS,
} from "./commission/index.js";

// ============================================================
// AGREEMENT MODELS
// ============================================================
export {
  CustomerHeaderDoc,
  VersionPdf,
  ManualUploadDocument,
  AdminHeaderDoc,
  DOCUMENT_STATUS,
  VERSION_STATUS,
  CREATION_REASON,
  UPLOAD_STATUS,
} from "./agreement/index.js";

// ============================================================
// ADMIN MODELS
// ============================================================
export {
  AdminSettings,
  BackupPricing,
} from "./admin/index.js";

// ============================================================
// LOGGING MODELS
// ============================================================
export {
  AuditLog,
  Log,
  BiginAuditLog,
  PriceOverrideLog,
  VersionChangeLog,
  AUDIT_ENTITIES,
  AUDIT_ACTIONS,
  SAVE_ACTIONS,
  CHANGE_TYPES,
  PRODUCT_TYPES,
} from "./logging/index.js";

// ============================================================
// SYNC MODELS
// ============================================================
export {
  BiginScrapeSession,
  MapDistanceRecord,
  MapDistanceSyncJob,
  ZohoMapping,
  SCRAPE_SESSION_STATUS,
  FREQUENCY_MAP,
  FREQUENCY_REVERSE_MAP,
  DAY_OF_WEEK_MAP,
  DAY_OF_WEEK_REVERSE_MAP,
  SYNC_JOB_STATUS,
  SYNC_JOB_TYPE,
} from "./sync/index.js";

// ============================================================
// PROPOSAL MODELS
// ============================================================
export {
  Proposal,
  Catalog,
  FileAsset,
  APPROVAL_STATUS,
  SYNC_STATUS,
  FILE_KINDS,
  STORAGE_TYPES,
} from "./proposal/index.js";

// ============================================================
// DOMAIN EXPORTS (for namespace imports)
// ============================================================
import * as UserModels from "./user/index.js";
import * as CustomerModels from "./customer/index.js";
import * as ProductModels from "./product/index.js";
import * as ServiceModels from "./service/index.js";
import * as CommissionModels from "./commission/index.js";
import * as AgreementModels from "./agreement/index.js";
import * as AdminModels from "./admin/index.js";
import * as LoggingModels from "./logging/index.js";
import * as SyncModels from "./sync/index.js";
import * as ProposalModels from "./proposal/index.js";

export {
  UserModels,
  CustomerModels,
  ProductModels,
  ServiceModels,
  CommissionModels,
  AgreementModels,
  AdminModels,
  LoggingModels,
  SyncModels,
  ProposalModels,
};

// ============================================================
// DEFAULT EXPORT (All Models)
// ============================================================
export default {
  // User
  AdminUser: UserModels.AdminUser,
  Employee: UserModels.Employee,

  // Customer
  RouteStarCustomer: CustomerModels.RouteStarCustomer,
  BiginCompany: CustomerModels.BiginCompany,
  CompanyMapping: CustomerModels.CompanyMapping,

  // Product
  ProductCatalog: ProductModels.ProductCatalog,
  PriceFix: ProductModels.PriceFix,
  PriceFixItem: ProductModels.PriceFixItem,

  // Service
  ServiceConfig: ServiceModels.ServiceConfig,
  EmailTemplate: ServiceModels.EmailTemplate,
  ServiceAgreementTemplate: ServiceModels.ServiceAgreementTemplate,

  // Commission
  CommissionRules: CommissionModels.CommissionRules,
  CommissionRecord: CommissionModels.CommissionRecord,
  SalesPerson: CommissionModels.SalesPerson,
  Agreement: CommissionModels.Agreement,
  QuotaPeriod: CommissionModels.QuotaPeriod,

  // Agreement
  CustomerHeaderDoc: AgreementModels.CustomerHeaderDoc,
  VersionPdf: AgreementModels.VersionPdf,
  ManualUploadDocument: AgreementModels.ManualUploadDocument,
  AdminHeaderDoc: AgreementModels.AdminHeaderDoc,

  // Admin
  AdminSettings: AdminModels.AdminSettings,
  BackupPricing: AdminModels.BackupPricing,

  // Logging
  AuditLog: LoggingModels.AuditLog,
  Log: LoggingModels.Log,
  BiginAuditLog: LoggingModels.BiginAuditLog,
  PriceOverrideLog: LoggingModels.PriceOverrideLog,
  VersionChangeLog: LoggingModels.VersionChangeLog,

  // Sync
  BiginScrapeSession: SyncModels.BiginScrapeSession,
  MapDistanceRecord: SyncModels.MapDistanceRecord,
  MapDistanceSyncJob: SyncModels.MapDistanceSyncJob,
  ZohoMapping: SyncModels.ZohoMapping,

  // Proposal
  Proposal: ProposalModels.Proposal,
  Catalog: ProposalModels.Catalog,
  FileAsset: ProposalModels.FileAsset,
};
