/**
 * Product Models - Index
 * Exports all product-related models
 */

import ProductCatalog, {
  PRODUCT_KINDS,
  BILLING_PERIODS,
} from "./ProductCatalog.model.js";

import PriceFix from "./PriceFix.model.js";
import PriceFixItem, { PRICE_CATEGORIES } from "./PriceFixItem.model.js";

export {
  // Models
  ProductCatalog,
  PriceFix,
  PriceFixItem,

  // Constants
  PRODUCT_KINDS,
  BILLING_PERIODS,
  PRICE_CATEGORIES,
};

export default {
  ProductCatalog,
  PriceFix,
  PriceFixItem,
};
