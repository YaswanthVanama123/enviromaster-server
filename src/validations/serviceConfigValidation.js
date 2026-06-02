import Joi from "joi";

const baseSchema = {
  serviceId: Joi.string().trim().required(),
  version: Joi.string().trim().required(),

  label: Joi.string().allow("").optional(),
  description: Joi.string().allow("").optional(),

  config: Joi.object().unknown(true).required(),

  defaultFormState: Joi.object().unknown(true).optional(),

  isActive: Joi.boolean().optional(),
  adminByDisplay: Joi.boolean().optional(),
  tags: Joi.array().items(Joi.string()).optional(),
  images: Joi.array().items(
    Joi.object({ url: Joi.string().uri().required(), caption: Joi.string().allow("").optional() })
  ).optional(),
  links: Joi.array().items(
    Joi.object({ label: Joi.string().required(), url: Joi.string().uri().required() })
  ).optional(),
};

const createServiceConfigSchema = Joi.object(baseSchema);

const replaceServiceConfigSchema = Joi.object(baseSchema);

const partialUpdateServiceConfigSchema = Joi.object({
  serviceId: Joi.string().trim().optional(),
  version: Joi.string().trim().optional(),
  label: Joi.string().allow("").optional(),
  description: Joi.string().allow("").optional(),
  config: Joi.object().unknown(true).optional(),
  defaultFormState: Joi.object().unknown(true).optional(),
  isActive: Joi.boolean().optional(),
  adminByDisplay: Joi.boolean().optional(),
  tags: Joi.array().items(Joi.string()).optional(),
  images: Joi.array().items(
    Joi.object({ url: Joi.string().uri().required(), caption: Joi.string().allow("").optional() })
  ).optional(),
  links: Joi.array().items(
    Joi.object({ label: Joi.string().required(), url: Joi.string().uri().required() })
  ).optional(),
}).min(1);

export function validateCreateServiceConfig(payload) {
  return createServiceConfigSchema.validate(payload, { abortEarly: false });
}

export function validateReplaceServiceConfig(payload) {
  return replaceServiceConfigSchema.validate(payload, { abortEarly: false });
}

export function validatePartialUpdateServiceConfig(payload) {
  return partialUpdateServiceConfigSchema.validate(payload, {
    abortEarly: false,
  });
}
