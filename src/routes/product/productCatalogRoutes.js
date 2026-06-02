import express from "express";
import * as productCatalogController from "../../controllers/product/productCatalogController.js";
import * as productDescriptionController from "../../controllers/product/productDescriptionController.js";
import PricingChangeDetector from "../../middleware/pricingChangeDetector.js";

const router = express.Router();

router.post(
  "/",
  productCatalogController.createCatalogController
);

router.get(
  "/",
  productCatalogController.getAllCatalogsController
);

router.get(
  "/active",
  productCatalogController.getActiveCatalogController
);

router.get(
  "/category/:familyKey",
  productCatalogController.getByCategoryController
);

router.get(
  "/products/search",
  productCatalogController.searchProductsController
);

router.post(
  "/add-descriptions",
  productDescriptionController.addProductDescriptions
);

router.put(
  "/product/:productKey/description",
  productDescriptionController.updateProductDescription
);

router.get(
  "/missing-descriptions",
  productDescriptionController.getMissingDescriptions
);

router.post(
  "/add-comprehensive-data",
  productDescriptionController.addComprehensiveProductData
);

router.get(
  "/comprehensive-data",
  productDescriptionController.getComprehensiveProductData
);

router.get(
  "/service-pricing",
  productDescriptionController.getServicePricing
);

router.get(
  "/products-by-category/:category",
  productDescriptionController.getProductsByCategory
);

router.get(
  "/pricing-summary",
  productDescriptionController.getPricingSummary
);

router.get(
  "/categories",
  productDescriptionController.getAvailableCategories
);

router.get(
  "/:id",
  productCatalogController.getCatalogByIdController
);

router.put(
  "/:id",
  PricingChangeDetector.beforeProductCatalogUpdate,
  PricingChangeDetector.addBackupInfoToResponse,
  productCatalogController.replaceCatalogController
);

router.put(
  "/:id/partial",
  PricingChangeDetector.beforeProductCatalogUpdate,
  PricingChangeDetector.addBackupInfoToResponse,
  productCatalogController.partialUpdateCatalogController
);

export default router;
