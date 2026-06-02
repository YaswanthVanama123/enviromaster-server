// Quick script to update only Electrostatic Spray configuration
import mongoose from "mongoose";
import dotenv from "dotenv";
import ServiceConfig from "../src/models/ServiceConfig.js";

dotenv.config();

const electrostaticSprayConfig = {
  pricingMethodOptions: [
    "By Room",
    "By Square Feet"
  ],
  frequencyOptions: [
    "Weekly",
    "Bi-Weekly",
    "Monthly",
    "Bi-Monthly",
    "Quarterly"
  ],
  locationOptions: [
    "Inside Beltway",
    "Outside Beltway",
    "Standard"
  ],
  combinedServiceOptions: [
    "Sani-Clean",
    "None"
  ],
  defaultRatePerRoom: 20,
  defaultRatePerSqFt: 0.15,
  defaultTripCharge: 10,

  // Additional editable pricing fields
  ratePerRoom: 20,
  ratePerThousandSqFt: 50,
  sqFtUnit: 1000,

  tripCharges: {
    insideBeltway: 10,
    outsideBeltway: 0,
    standard: 0,
  },

  billingConversions: {
    weekly: { monthlyMultiplier: 4.33, annualMultiplier: 52 },
    biweekly: { monthlyMultiplier: 2.165, annualMultiplier: 26 },
    monthly: { monthlyMultiplier: 1, annualMultiplier: 12 },
    bimonthly: { monthlyMultiplier: 0.5, annualMultiplier: 6 },
    quarterly: { monthlyMultiplier: 0.333, annualMultiplier: 4 },
    actualWeeksPerMonth: 4.33,
  },

  minContractMonths: 2,
  maxContractMonths: 36,
};

async function updateElectrostaticSpray() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✓ Connected to MongoDB");

    console.log("\nUpdating Electrostatic Spray configuration...");

    const result = await ServiceConfig.findOneAndUpdate(
      { serviceId: "electrostaticSpray" },
      {
        $set: {
          config: electrostaticSprayConfig,
          version: "v1.0",
          label: "Electrostatic Spray",
          description: "Professional facility disinfection using electrostatic spraying",
          isActive: true,
          tags: ["disinfection", "facility-wide", "electrostatic"]
        }
      },
      { new: true, upsert: true }
    );

    console.log("✅ Electrostatic Spray configuration updated successfully!");
    console.log("\nUpdated config:");
    console.log(JSON.stringify(result.config, null, 2));

  } catch (error) {
    console.error("\n❌ Error updating configuration:", error);
    throw error;
  } finally {
    await mongoose.connection.close();
    console.log("\n✓ Database connection closed");
  }
}

updateElectrostaticSpray().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
