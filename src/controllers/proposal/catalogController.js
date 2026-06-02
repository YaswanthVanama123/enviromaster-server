import { Catalog } from "../../models/proposal/index.js";

export async function getCatalog(req, res) {
  const key = req.query.key || 'default';
  const doc = await Catalog.findOne({ key });
  if (!doc) return res.json({ key, smallProducts: [], dispensers: [], bigProducts: [] });
  res.json(doc);
}

export async function updateCatalog(req, res) {
  const key = req.body.key || 'default';
  const payload = {
    key,
    smallProducts: Array.isArray(req.body.smallProducts) ? req.body.smallProducts : [],
    dispensers: Array.isArray(req.body.dispensers) ? req.body.dispensers : [],
    bigProducts: Array.isArray(req.body.bigProducts) ? req.body.bigProducts : []
  };
  const updated = await Catalog.findOneAndUpdate({ key }, payload, { new: true, upsert: true });
  res.json(updated);
}
