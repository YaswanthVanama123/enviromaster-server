/**
 * Customer Models - Index
 * Exports all customer-related models
 */

import RouteStarCustomer, { CUSTOMER_STATUS } from "./RouteStarCustomer.model.js";
import BiginCompany, { BIGIN_STAGES } from "./BiginCompany.model.js";
import CompanyMapping, { MAPPING_STATUS } from "./CompanyMapping.model.js";

export {
  // Models
  RouteStarCustomer,
  BiginCompany,
  CompanyMapping,

  // Constants
  CUSTOMER_STATUS,
  BIGIN_STAGES,
  MAPPING_STATUS,
};

export default {
  RouteStarCustomer,
  BiginCompany,
  CompanyMapping,
};
