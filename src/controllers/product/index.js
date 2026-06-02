/**
 * Product Controllers - Index
 * Exports all product-related controller functions
 */

// Product Catalog
export {
  createCatalogController,
  getAllCatalogsController,
  getActiveCatalogController,
  getCatalogByIdController,
  replaceCatalogController,
  partialUpdateCatalogController,
  getByCategoryController,
  searchProductsController,
} from "./productCatalogController.js";

// Price Fix
export {
  createPriceFix,
  getAllPriceFixes,
  getPriceFixById,
  updatePriceFix,
} from "./priceFixController.js";

// Product Description
export {
  getProductCatalog,
  addProductDescriptions,
  updateProductDescription,
  getMissingDescriptions,
  addComprehensiveProductData,
  getComprehensiveProductData,
  getServicePricing,
  getProductsByCategory,
  getPricingSummary,
  getAvailableCategories,
} from "./productDescriptionController.js";

// Account Type Detection
export {
  detect as detectAccountType,
  detectBatch as detectAccountTypeBatch,
  getThresholds as getAccountTypeThresholds,
} from "./accountTypeController.js";

// Default export for account type controller
export { default as accountTypeController } from "./accountTypeController.js";
