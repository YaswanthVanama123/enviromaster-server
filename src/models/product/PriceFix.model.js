import mongoose from "mongoose";

const { Schema } = mongoose;

const RestroomHygienePricingSchema = new Schema(
  {
    ratePerFixture: { type: Number, required: true },
    weeklyMinimum: { type: Number, required: true },
    tripChargeStandard: { type: Number, required: true },
    insideBeltwayExtra: { type: Number, default: 0 },
    maxFixturesPerLocation: { type: Number, default: 200 }
  },
  { _id: false }
);

const FoamingDrainPricingSchema = new Schema(
  {
    standardDrainRate: { type: Number, required: true },
    largeDrainBaseCharge: { type: Number, required: true },
    largeDrainExtraPerDrain: { type: Number, required: true },
    greaseTrapRate: { type: Number, default: 0 },
    installMultiplierFilthy: { type: Number, required: true },
    defaultFrequency: { type: String, default: "Weekly" }
  },
  { _id: false }
);

const ScrubServicePricingSchema = new Schema(
  {
    fixtureRate: { type: Number, required: true },
    fixtureMinimum: { type: Number, required: true },
    nonBathroomUnitSqFt: { type: Number, required: true },
    nonBathroomFirstUnitRate: { type: Number, required: true },
    nonBathroomAdditionalUnitRate: { type: Number, required: true },
    installMultiplierClean: { type: Number, default: 1 },
    installMultiplierDirty: { type: Number, required: true },
    allowedFrequencies: {
      type: [String],
      default: ["Monthly", "Bi-Monthly", "Quarterly"]
    }
  },
  { _id: false }
);

const HandSanitizerPricingSchema = new Schema(
  {
    fillRatePerUnit: { type: Number, required: true },
    perGallonPrice: { type: Number, required: true },
    dispenserInstallCharge: { type: Number, required: true },
    warrantyPerDispenserWeekly: { type: Number, required: true },
    defaultFrequency: { type: String, default: "Weekly" }
  },
  { _id: false }
);

const MicromaxFloorPricingSchema = new Schema(
  {
    includedBathroomRate: { type: Number, required: true },
    extraAreaSqFtUnit: { type: Number, required: true },
    extraAreaRatePerUnit: { type: Number, required: true },
    standaloneSqFtUnit: { type: Number, required: true },
    standaloneRatePerUnit: { type: Number, required: true },
    standaloneMinimum: { type: Number, required: true },
    chemicalPerGallon: { type: Number, required: true },
    defaultFrequency: { type: String, default: "Weekly" }
  },
  { _id: false }
);

const RpmWindowPricingSchema = new Schema(
  {
    smallWindowRate: { type: Number, required: true },
    mediumWindowRate: { type: Number, required: true },
    largeWindowRate: { type: Number, required: true },
    tripCharge: { type: Number, required: true },
    installMultiplierFirstTime: { type: Number, required: true },
    allowedFrequencies: {
      type: [String],
      default: ["Weekly", "Bi-Weekly", "Monthly", "Quarterly"]
    }
  },
  { _id: false }
);

const SaniPodPricingSchema = new Schema(
  {
    weeklyRatePerUnit: { type: Number, required: true },
    installChargePerUnit: { type: Number, required: true },
    extraBagPrice: { type: Number, required: true },
    standaloneMinimum: { type: Number, required: true },
    defaultFrequency: { type: String, default: "Weekly" }
  },
  { _id: false }
);

const TripChargePricingSchema = new Schema(
  {
    standard: { type: Number, required: true },
    insideBeltway: { type: Number, required: true },
    paidParking: { type: Number, required: true },
    twoPerson: { type: Number, required: true }
  },
  { _id: false }
);

const ServicesPricingSchema = new Schema(
  {
    restroomHygiene: { type: RestroomHygienePricingSchema, required: true },
    foamingDrain: { type: FoamingDrainPricingSchema, required: true },
    scrubService: { type: ScrubServicePricingSchema, required: true },
    handSanitizer: { type: HandSanitizerPricingSchema, required: true },
    micromaxFloor: { type: MicromaxFloorPricingSchema, required: true },
    rpmWindow: { type: RpmWindowPricingSchema, required: true },
    saniPod: { type: SaniPodPricingSchema, required: true },
    tripCharge: { type: TripChargePricingSchema, required: true }
  },
  { _id: false }
);

const PriceFixSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    description: { type: String },
    services: { type: ServicesPricingSchema, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "AdminUser" },
    updatedBy: { type: Schema.Types.ObjectId, ref: "AdminUser" }
  },
  { timestamps: true }
);

const PriceFix = mongoose.model("PriceFix", PriceFixSchema);

export default PriceFix;
