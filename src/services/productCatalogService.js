import { ProductCatalog } from "../models/product/index.js";

export async function getActiveCatalog() {
  return ProductCatalog.findOne({ isActive: true })
    .sort({ updatedAt: -1 })
    .lean();
}

export async function getCatalogById(id) {
  return ProductCatalog.findById(id);
}

export async function createCatalog(data) {
  const { isActive } = data;

  if (isActive) {
    await ProductCatalog.updateMany(
      { isActive: true },
      { $set: { isActive: false } }
    );
  }

  const doc = new ProductCatalog(data);
  return doc.save();
}

export async function replaceCatalog(id, data) {
  const existing = await ProductCatalog.findById(id);
  if (!existing) return null;

  if (data.isActive) {
    await ProductCatalog.updateMany(
      { _id: { $ne: id }, isActive: true },
      { $set: { isActive: false } }
    );
  }

  existing.version = data.version;
  existing.lastUpdated = data.lastUpdated || existing.lastUpdated;
  existing.currency = data.currency || existing.currency;
  existing.families = data.families;

  if (typeof data.isActive === "boolean") existing.isActive = data.isActive;
  if (typeof data.note === "string") existing.note = data.note;

  return existing.save();
}

export async function mergePartialCatalog(id, partial) {
  const existing = await ProductCatalog.findById(id);
  if (!existing) return null;

  if (partial.version) existing.version = partial.version;
  if (partial.lastUpdated) existing.lastUpdated = partial.lastUpdated;
  if (partial.currency) existing.currency = partial.currency;

  if (typeof partial.isActive === "boolean") {
    existing.isActive = partial.isActive;
    if (partial.isActive) {
      await ProductCatalog.updateMany(
        { _id: { $ne: id }, isActive: true },
        { $set: { isActive: false } }
      );
    }
  }

  if (typeof partial.note === "string") existing.note = partial.note;

  if (Array.isArray(partial.families)) {
    partial.families.forEach((famInput) => {
      if (!famInput || !famInput.key) return;
      const famIndex = existing.families.findIndex((f) => f.key === famInput.key);

      if (famIndex === -1) {
        existing.families.push(famInput);
        return;
      }

      const fam = existing.families[famIndex];

      if (typeof famInput.label === "string") fam.label = famInput.label;
      if (typeof famInput.sortOrder === "number")
        fam.sortOrder = famInput.sortOrder;

      if (Array.isArray(famInput.products)) {
        famInput.products.forEach((prodInput) => {
          if (!prodInput || !prodInput.key) return;

          const prodIndex = fam.products.findIndex((p) => p.key === prodInput.key);

          if (prodInput._delete) {
            if (prodIndex !== -1) fam.products.splice(prodIndex, 1);
            return;
          }

          if (prodIndex === -1) {
            fam.products.push(prodInput);
          } else {
            const prod = fam.products[prodIndex];
            Object.keys(prodInput).forEach((k) => {
              if (k !== "_delete") prod[k] = prodInput[k];
            });
          }
        });
      }
    });
  }

  return existing.save();
}

export async function searchProductsFromActive(filters) {
  const catalog = await getActiveCatalog();
  if (!catalog) return [];

  const { familyKey, kind, key, displayByAdmin } = filters;

  const allProducts = catalog.families.flatMap((fam) =>
    fam.products.map((p) => ({
      ...p,
      familyKey: fam.key,
      familyLabel: fam.label,
    }))
  );

  return allProducts.filter((p) => {
    if (familyKey && p.familyKey !== familyKey) return false;
    if (kind && p.kind !== kind) return false;
    if (key && p.key !== key) return false;
    if (
      typeof displayByAdmin === "boolean" &&
      p.displayByAdmin !== displayByAdmin
    )
      return !(typeof displayByAdmin === "boolean" && p.displayByAdmin !== displayByAdmin);
    return true;
  });
}

export async function getFamilyFromActive(familyKey) {
  const catalog = await getActiveCatalog();
  if (!catalog) return null;
  return catalog.families.find((fam) => fam.key === familyKey) || null;
}
