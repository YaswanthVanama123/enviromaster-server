import { ProductCatalog } from "../../models/product/index.js";

import {
  validateCreateCatalog,
  validateReplaceCatalog,
  validatePartialUpdate,
} from "../../validations/productCatalogValidation.js";

import {
  getActiveCatalog,
  getCatalogById,
  createCatalog,
  replaceCatalog,
  mergePartialCatalog,
  searchProductsFromActive,
  getFamilyFromActive,
} from "../../services/productCatalogService.js";

export async function createCatalogController(req, res, next) {
  try {
    const { error, value } = validateCreateCatalog(req.body);
    if (error) {
      return res.status(400).json({
        message: "Validation error",
        details: error.details.map((d) => d.message),
      });
    }

    const created = await createCatalog(value);
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
}

export async function getAllCatalogsController(req, res, next) {
  try {
    const docs = await ProductCatalog.find()
      .sort({ createdAt: -1 })
      .lean();
    res.json(docs);
  } catch (err) {
    next(err);
  }
}

export async function getActiveCatalogController(req, res, next) {
  try {
    const catalog = await getActiveCatalog();
    if (!catalog) {
      return res.status(404).json({ message: "No active catalog found" });
    }
    res.json(catalog);
  } catch (err) {
    next(err);
  }
}

export async function getCatalogByIdController(req, res, next) {
  try {
    const { id } = req.params;
    const catalog = await getCatalogById(id);
    if (!catalog) {
      return res.status(404).json({ message: "Catalog not found" });
    }
    res.json(catalog);
  } catch (err) {
    next(err);
  }
}

export async function replaceCatalogController(req, res, next) {
  try {
    const { id } = req.params;

    const { error, value } = validateReplaceCatalog(req.body);
    if (error) {
      return res.status(400).json({
        message: "Validation error",
        details: error.details.map((d) => d.message),
      });
    }

    const updated = await replaceCatalog(id, value);
    if (!updated) {
      return res.status(404).json({ message: "Catalog not found" });
    }

    res.json(updated);
  } catch (err) {
    next(err);
  }
}

export async function partialUpdateCatalogController(req, res, next) {
  try {
    const { id } = req.params;

    const { error, value } = validatePartialUpdate(req.body);
    if (error) {
      return res.status(400).json({
        message: "Validation error",
        details: error.details.map((d) => d.message),
      });
    }

    const updated = await mergePartialCatalog(id, value);
    if (!updated) {
      return res.status(404).json({ message: "Catalog not found" });
    }

    res.json(updated);
  } catch (err) {
    next(err);
  }
}

export async function getByCategoryController(req, res, next) {
  try {
    const { familyKey } = req.params;
    const family = await getFamilyFromActive(familyKey);

    if (!family) {
      return res.status(404).json({
        message: "Category not found in active catalog",
      });
    }

    res.json(family);
  } catch (err) {
    next(err);
  }
}

export async function searchProductsController(req, res, next) {
  try {
    const { familyKey, kind, key } = req.query;

    let displayByAdmin;
    if (req.query.displayByAdmin === "true") displayByAdmin = true;
    if (req.query.displayByAdmin === "false") displayByAdmin = false;

    const results = await searchProductsFromActive({
      familyKey,
      kind,
      key,
      displayByAdmin,
    });

    res.json(results);
  } catch (err) {
    next(err);
  }
}
