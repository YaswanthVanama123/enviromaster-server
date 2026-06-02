import mongoose from 'mongoose';

const CatalogSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    smallProducts: [{ type: String, trim: true }],
    dispensers:    [{ type: String, trim: true }],
    bigProducts:   [{ type: String, trim: true }]
  },
  { timestamps: true }
);

const Catalog = mongoose.model('Catalog', CatalogSchema);

export default Catalog;
