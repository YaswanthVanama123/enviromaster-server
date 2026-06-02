/**
 * Service Models - Index
 * Exports all service-related models
 */

import ServiceConfig, { SERVICE_IDS } from "./ServiceConfig.model.js";
import EmailTemplate from "./EmailTemplate.model.js";
import ServiceAgreementTemplate from "./ServiceAgreementTemplate.model.js";

export {
  // Models
  ServiceConfig,
  EmailTemplate,
  ServiceAgreementTemplate,

  // Constants
  SERVICE_IDS,
};

export default {
  ServiceConfig,
  EmailTemplate,
  ServiceAgreementTemplate,
};
