import Joi from "joi";

const priceSchema = Joi.object({
  key: Joi.string().required(),
  name: Joi.string().required(),
  familyKey: Joi.string().required(),
  kind: Joi.string().optional(),

  basePrice: Joi.object({
    amount: Joi.number().optional(),
    currency: Joi.string().optional(),
    uom: Joi.string().optional(),
    unitSizeLabel: Joi.string().optional(),
  }).optional(),

  warrantyPricePerUnit: Joi.object({
    amount: Joi.number().optional(),
    currency: Joi.string().optional(),
    uom: Joi.string().optional(),
    billingPeriod: Joi.string().optional(),
  }).optional(),

  effectivePerRollPriceInternal: Joi.number().optional(),
  suggestedCustomerRollPrice: Joi.number().optional(),
  quantityPerCase: Joi.number().optional(),
  quantityPerCaseLabel: Joi.string().optional(),

  frequency: Joi.string().allow('').optional(),
  description: Joi.string().allow('').optional(),

  displayByAdmin: Joi.boolean().optional(),

  _delete: Joi.boolean().optional(),
});

const familySchema = Joi.object({
  key: Joi.string().required(),
  label: Joi.string().optional(),
  sortOrder: Joi.number().optional(),
  products: Joi.array().items(priceSchema).optional(),
});

const catalogBaseSchema = {
  version: Joi.string().required(),
  lastUpdated: Joi.string().optional(),
  currency: Joi.string().optional(),
  families: Joi.array().items(familySchema).min(1).required(),
  isActive: Joi.boolean().optional(),
  note: Joi.string().optional(),
};

const createCatalogSchema = Joi.object(catalogBaseSchema);
const replaceCatalogSchema = Joi.object(catalogBaseSchema);

const partialUpdateSchema = Joi.object({
  version: Joi.string().optional(),
  lastUpdated: Joi.string().optional(),
  currency: Joi.string().optional(),
  isActive: Joi.boolean().optional(),
  note: Joi.string().optional(),
  families: Joi.array().items(familySchema).optional(),
}).min(1);

export function validateCreateCatalog(payload) {
  return createCatalogSchema.validate(payload, { abortEarly: false });
}

export function validateReplaceCatalog(payload) {
  return replaceCatalogSchema.validate(payload, { abortEarly: false });
}

export function validatePartialUpdate(payload) {
  return partialUpdateSchema.validate(payload, { abortEarly: false });
}
