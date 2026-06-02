import { PRICE_CATEGORIES } from "../models/product/index.js";

export function validatePriceFixInput(payload) {
  const errors = [];

  const items = Array.isArray(payload) ? payload : [payload];

  for (const [i, it] of items.entries()) {
    if (!it.category || !PRICE_CATEGORIES.includes(it.category)) {
      errors.push(`#${i}: category must be one of ${PRICE_CATEGORIES.join(", ")}`);
    }
    if (!it.serviceName || typeof it.serviceName !== "string") {
      errors.push(`#${i}: serviceName is required (string)`);
    }
    if (it.currentPrice != null && typeof it.currentPrice !== "number") {
      errors.push(`#${i}: currentPrice must be a number`);
    }
    if (it.newPrice != null && typeof it.newPrice !== "number") {
      errors.push(`#${i}: newPrice must be a number`);
    }
    if (it.effectiveFrom && isNaN(Date.parse(it.effectiveFrom))) {
      errors.push(`#${i}: effectiveFrom must be an ISO date string`);
    }
  }

  return { ok: errors.length === 0, errors };
}
