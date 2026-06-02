/**
 * Service Controllers - Index
 * Exports all service-related controller functions
 */

// Service Config
export {
  createServiceConfigController,
  getAllServiceConfigsController,
  getActiveServiceConfigsController,
  getAllServicePricingController,
  getServiceConfigByIdController,
  getLatestConfigForServiceController,
  replaceServiceConfigController,
  partialUpdateServiceConfigController,
  deleteServiceConfigController,
  deleteServiceConfigsByServiceIdController,
  uploadServiceImageController,
} from "./serviceConfigController.js";

// Service Agreement Template
export {
  getActiveTemplate as getActiveServiceAgreementTemplate,
  updateTemplate as updateServiceAgreementTemplate,
} from "./serviceAgreementTemplateController.js";

// Email Template
export {
  getActiveTemplate as getActiveEmailTemplate,
  updateTemplate as updateEmailTemplate,
  testTemplate as testEmailTemplate,
} from "./emailTemplateController.js";
