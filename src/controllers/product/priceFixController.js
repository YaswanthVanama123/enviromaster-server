import { PriceFix } from "../../models/product/index.js";

export const createPriceFix = async (req, res) => {
  try {
    const { key, description, services } = req.body;

    if (!key || !services) {
      return res.status(400).json({
        message: "key and services are required",
      });
    }

    const existing = await PriceFix.findOne({ key });
    if (existing) {
      return res.status(409).json({
        message: `PriceFix with key "${key}" already exists`,
      });
    }

    const doc = new PriceFix({
      key,
      description,
      services,
      createdBy: req.admin?._id ?? null,
      updatedBy: req.admin?._id ?? null,
    });

    await doc.save();

    return res.status(201).json(doc);
  } catch (err) {
    console.error("createPriceFix error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const getAllPriceFixes = async (req, res) => {
  try {
    const docs = await PriceFix.find().lean();
    return res.status(200).json(docs);
  } catch (err) {
    console.error("getAllPriceFixes error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const getPriceFixById = async (req, res) => {
  try {
    const { id } = req.params;

    const doc = await PriceFix.findById(id).lean();
    if (!doc) {
      return res.status(404).json({ message: "PriceFix not found" });
    }

    return res.status(200).json(doc);
  } catch (err) {
    console.error("getPriceFixById error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const updatePriceFix = async (req, res) => {
  try {
    const { id } = req.params;

    const update = {
      ...req.body,
      updatedBy: req.admin?._id ?? null,
    };

    const doc = await PriceFix.findByIdAndUpdate(id, update, {
      new: true,
      runValidators: true,
    });

    if (!doc) {
      return res.status(404).json({ message: "PriceFix not found" });
    }

    return res.status(200).json(doc);
  } catch (err) {
    console.error("updatePriceFix error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};
