import mongoose from "mongoose";

const { Schema } = mongoose;

export const PRICE_CATEGORIES = ["product", "dispenser"];

const PriceFixItemSchema = new Schema(
  {
    category: {
      type: String,
      enum: PRICE_CATEGORIES,
      required: true,
    },

    serviceName: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    currentPrice: {
      type: Number,
      default: 0,
      min: 0,
    },

    newPrice: {
      type: Number,
      default: 0,
      min: 0,
    },

    frequency: {
      type: String,
      default: "",
      trim: true,
    },

    effectiveFrom: {
      type: Date,
    },

    updatedBy: { type: String, default: "" },
  },
  { timestamps: true }
);

PriceFixItemSchema.index({ category: 1, serviceName: 1 }, { unique: true });

const PriceFixItem = mongoose.model("PriceFixItem", PriceFixItemSchema);
export default PriceFixItem;
