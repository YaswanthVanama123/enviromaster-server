/**
 * ProductCatalog Model
 * Product catalog with families and pricing
 */

import mongoose from "mongoose";

// Product Kind Enum
export const PRODUCT_KINDS = {
  ROLL: "roll",
  DISPENSER: "dispenser",
  ACCESSORY: "accessory",
  SERVICE: "service",
  CHEMICAL: "chemical",
  SUPPLY: "supply",
};

// Billing Period Enum
export const BILLING_PERIODS = {
  MONTHLY: "monthly",
  QUARTERLY: "quarterly",
  ANNUAL: "annual",
  ONE_TIME: "one-time",
};

// Price Schema
const PriceSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    name: { type: String, required: true },
    familyKey: { type: String, required: true },
    kind: { type: String },

    basePrice: {
      amount: Number,
      currency: String,
      uom: String,
      unitSizeLabel: String,
    },

    warrantyPricePerUnit: {
      amount: Number,
      currency: String,
      uom: String,
      billingPeriod: String,
    },

    effectivePerRollPriceInternal: Number,
    suggestedCustomerRollPrice: Number,
    quantityPerCase: Number,
    quantityPerCaseLabel: String,

    frequency: { type: String, default: "" },
    description: { type: String },
    displayByAdmin: { type: Boolean, default: false },
  },
  { _id: false }
);

// Family Schema
const FamilySchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    sortOrder: { type: Number, default: 0 },
    products: [PriceSchema],
  },
  { _id: false }
);

// Product Catalog Schema
const ProductCatalogSchema = new mongoose.Schema(
  {
    version: { type: String, required: true },
    lastUpdated: { type: String },
    currency: { type: String, default: "USD" },

    families: [FamilySchema],

    isActive: { type: Boolean, default: true },
    note: { type: String },
  },
  { timestamps: true }
);

// Indexes
ProductCatalogSchema.index({ isActive: 1 });
ProductCatalogSchema.index({ version: 1 });

// Static: Get active catalog
ProductCatalogSchema.statics.getActiveCatalog = function () {
  return this.findOne({ isActive: true }).sort({ createdAt: -1 });
};

// Static: Get product by key
ProductCatalogSchema.statics.findProductByKey = async function (productKey) {
  const catalog = await this.getActiveCatalog();
  if (!catalog) return null;

  for (const family of catalog.families) {
    const product = family.products.find((p) => p.key === productKey);
    if (product) return product;
  }
  return null;
};

const ProductCatalog = mongoose.model("ProductCatalog", ProductCatalogSchema);

export default ProductCatalog;
