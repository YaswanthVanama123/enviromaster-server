// scripts/seedServiceConfigsAndProducts.js
import mongoose from "mongoose";
import dotenv from "dotenv";
import ServiceConfig from "../src/models/ServiceConfig.js";
import ProductCatalog from "../src/models/ProductCatalog.js";

dotenv.config();

// ============================================================================
// SERVICE CONFIGURATIONS (from frontend)
// ============================================================================

const serviceConfigs = [
  // 1. SANICLEAN
  {
    serviceId: "saniclean",
    version: "v1.0",
    label: "SaniClean - Restroom & Hygiene",
    description: "Comprehensive restroom sanitization service",
    config: {
      geographicPricing: {
        insideBeltway: {
          ratePerFixture: 7,
          weeklyMinimum: 40,
          tripCharge: 0,
          parkingFee: 0,
        },
        outsideBeltway: {
          ratePerFixture: 6,
          weeklyMinimum: 40,
          tripCharge: 0,
        },
      },
      smallFacilityMinimum: {
        fixtureThreshold: 5,
        minimumWeeklyCharge: 40,
        includesTripCharge: true,
      },
      allInclusivePackage: {
        weeklyRatePerFixture: 20,
        includeAllAddOns: true,
        waiveTripCharge: true,
        waiveWarrantyFees: true,
        autoAllInclusiveMinFixtures: 10,
      },
      soapUpgrades: {
        standardToLuxury: 5,
        excessUsageCharges: {
          standardSoap: 13,
          luxurySoap: 30,
        },
      },
      warrantyFeePerDispenser: 1,
      paperCredit: {
        creditPerFixturePerWeek: 5,
      },
      facilityComponents: {
        urinals: {
          urinalScreen: 4,
          urinalMat: 4,
        },
        maleToilets: {
          toiletClips: 1.5,
          seatCoverDispenser: 0.5,
        },
        femaleToilets: {
          sanipodService: 4,
        },
        sinks: {
          ratioSinkToSoap: 1,
          ratioSinkToAirFreshener: 2,
        },
      },
      addOnServices: {
        microfiberMopping: {
          pricePerBathroom: 10,
        },
      },
      billingConversions: {
        weekly: {
          monthlyMultiplier: 4.33,
          annualMultiplier: 50,
        },
      },
      rateTiers: {
        redRate: {
          multiplier: 1.0,
          commissionRate: 0.1,
        },
        greenRate: {
          multiplier: 1.0,
          commissionRate: 0.12,
        },
      },
      valueProposition: [
        "Enviro-Master's core service since the Swisher days.",
        "Bathroom cleanliness signals whether a location can charge premium pricing.",
        "With SaniScrub, SaniClean reduces bacteria that can migrate to back-of-house.",
        "Reduces time and chemicals for existing staff between weekly sanitization visits.",
      ],
    },
    defaultFormState: {
      serviceId: "saniclean",
      fixtureCount: 0,
      location: "outsideBeltway",
      needsParking: false,
      pricingMode: "auto",
      sinks: 0,
      urinals: 0,
      maleToilets: 0,
      femaleToilets: 0,
      soapType: "standard",
      excessSoapGallonsPerWeek: 0,
      addMicrofiberMopping: false,
      microfiberBathrooms: 0,
      estimatedPaperSpendPerWeek: 0,
      contractMonths: 12,
      rateTier: "redRate",
      notes: "",
    },
    isActive: true,
    tags: ["restroom", "hygiene", "core-service"],
  },

  // 2. SANIPOD
  {
    serviceId: "sanipod",
    version: "v1.0",
    label: "SaniPod - Feminine Hygiene",
    description: "Feminine hygiene disposal service",
    config: {
      weeklyRatePerUnit: 3.0,
      altWeeklyRatePerUnit: 8.0,
      extraBagPrice: 2.0,
      installChargePerUnit: 25.0,
      standaloneExtraWeeklyCharge: 40.0,
      tripChargePerVisit: 0.0,
      defaultFrequency: "weekly",
      allowedFrequencies: ["weekly", "biweekly", "monthly"],
      annualFrequencies: {
        weekly: 52,
        biweekly: 26,
        monthly: 12,
      },
      weeksPerMonth: 4.33,
      weeksPerYear: 52,
      minContractMonths: 2,
      maxContractMonths: 36,
      rateCategories: {
        redRate: {
          multiplier: 1.0,
          commissionRate: "20%",
        },
        greenRate: {
          multiplier: 1.3,
          commissionRate: "25%",
        },
      },
    },
    defaultFormState: {
      serviceId: "sanipod",
      units: 0,
      extraBags: 0,
      extraBagsRecurring: false,
      contractMonths: 12,
      frequency: "weekly",
      rateTier: "redRate",
      notes: "",
    },
    isActive: true,
    tags: ["restroom", "hygiene", "add-on"],
  },

  // 3. SANISCRUB - CORRECTED CONFIGURATION
  {
    serviceId: "saniscrub",
    version: "v2.0",
    label: "SaniScrub - Deep Cleaning Bathroom Service",
    description: "Professional bathroom and front-of-house deep cleaning service designed to work with SaniClean",
    config: {
      // Bathroom fixture pricing
      bathroomPricing: {
        monthly: {
          ratePerFixture: 25,
          minimumCharge: 175,
          description: "Monthly deep cleaning service"
        },
        twicePerMonth: {
          baseRatePerFixture: 25,
          minimumCharge: 175,
          combineWithSaniDiscount: 15,
          description: "Twice per month service - combine with SaniClean for $15 discount"
        },
        bimonthly: {
          ratePerFixture: 35,
          minimumCharge: 250,
          description: "Every two months service"
        },
        quarterly: {
          ratePerFixture: 40,
          minimumCharge: 250,
          description: "Quarterly service"
        }
      },

      // Non-bathroom (front of house) pricing
      nonBathroomPricing: {
        unitSqFt: 500,
        firstUnitRate: 250,
        additionalUnitRate: 125,
        description: "Up to 500 sq ft = $250, each additional 500 sq ft = $125",
        examples: {
          "1000_sqft": "2 units = $250 + 1×$125 = $375",
          "1500_sqft": "3 units = $250 + 2×$125 = $500",
          "3000_sqft": "6 units = $250 + 5×$125 = $875"
        }
      },

      // Installation pricing
      installationPricing: {
        multipliers: {
          dirty: 3,
          clean: 1
        },
        tripCharge: 0,
        parkingFee: 0,
        strategy: {
          sellAt: "3x normal cost",
          canWaiveAsConsession: true,
          noPriceConcessionIfInstallWaived: true
        },
        description: "Install: 3x normal price if dirty, 1x if clean. No trip charge."
      },

      // Trip charges
      tripCharges: {
        standard: 0,
        install: 0,
        parkingFee: 0,
        description: "No trip charges or parking fees for any SaniScrub services."
      },

      // Frequency configurations
      frequencyMeta: {
        monthly: {
          visitsPerYear: 12,
          monthlyMultiplier: 1.0,
          recommended: true
        },
        twicePerMonth: {
          visitsPerYear: 24,
          monthlyMultiplier: 2.0,
          requiresSaniCleanCombo: true,
          discountWhenCombined: 15
        },
        bimonthly: {
          visitsPerYear: 6,
          monthlyMultiplier: 0.5
        },
        quarterly: {
          visitsPerYear: 4,
          monthlyMultiplier: 0.333
        }
      },

      // Business rules
      businessRules: {
        recommendCombineWithSaniClean: true,
        twicePerMonthRequiresSaniClean: true,
        discountForTwicePerMonthCombo: 15,
        installCanBeWaivedAsConsession: true,
        noPriceConcessionIfInstallWaived: true,
        targetFrequency: "monthly"
      },

      // Value proposition
      valueProposition: {
        bathroomServices: [
          "Add-on to SaniClean for maximum effectiveness",
          "SaniClean reduces bacteria source, SaniScrub removes the remainder",
          "Designed to work together for complete bacteria control",
          "Saves customer mopping costs and time"
        ],
        frontOfHouseServices: [
          "No comparable service available from janitorial companies",
          "Addresses bacteria in grout that standard cleaning misses",
          "Essential for maintaining food safety standards",
          "Without this service, bacteria lives, feeds and breeds in grout"
        ]
      }
    },
    defaultFormState: {
      serviceId: "saniscrub",
      serviceArea: "bathroom", // bathroom or frontOfHouse
      fixtures: 0,
      squareFeet: 0, // for front of house
      frequency: "monthly",
      combineWithSaniClean: false,
      installCondition: "clean",
      addInstall: false,
      contractMonths: 12,
      location: "standard",
      needsParking: false,
      notes: ""
    },
    isActive: true,
    tags: ["bathroom", "deep-cleaning", "grout-cleaning", "bacteria-control", "sani-addon"]
  },

  // 4. FOAMING DRAIN
  {
    serviceId: "foamingDrain",
    version: "v1.0",
    label: "Foaming Drain Treatment",
    description: "Preventive drain maintenance service",
    config: {
      standardDrainRate: 10,
      altBaseCharge: 20,
      altExtraPerDrain: 4,
      volumePricing: {
        minimumDrains: 10,
        weekly: {
          ratePerDrain: 20,
        },
        bimonthly: {
          ratePerDrain: 10,
        },
      },
      grease: {
        weeklyRatePerTrap: 125,
        installPerTrap: 300,
      },
      green: {
        weeklyRatePerDrain: 5,
        installPerDrain: 100,
      },
      plumbing: {
        weeklyAddonPerDrain: 10,
      },
      installationRules: {
        filthyMultiplier: 3,
      },
      tripCharges: {
        standard: 0,
        beltway: 0,
      },
      billingConversions: {
        weekly: {
          monthlyVisits: 4.3,
          firstMonthExtraMonths: 3.3,
          normalMonthFactor: 4.3,
        },
        bimonthly: {
          monthlyMultiplier: 0.5,
        },
      },
      contract: {
        minMonths: 2,
        maxMonths: 36,
        defaultMonths: 12,
      },
      defaultFrequency: "weekly",
      allowedFrequencies: ["weekly", "bimonthly"],
    },
    defaultFormState: {
      serviceId: "foamingDrain",
      standardDrains: 0,
      greaseTraps: 0,
      greenDrains: 0,
      frequency: "weekly",
      addPlumbing: false,
      installCondition: "clean",
      contractMonths: 12,
      notes: "",
    },
    isActive: true,
    tags: ["drain", "preventive"],
  },

  // 5. GREASE TRAP
  {
    serviceId: "greaseTrap",
    version: "v1.0",
    label: "Grease Trap Service",
    description: "Grease trap pumping and maintenance",
    config: {
      perTrapRate: 50,
      perGallonRate: 2,
    },
    defaultFormState: {
      serviceId: "greaseTrap",
      traps: 0,
      gallons: 0,
      frequency: "monthly",
      notes: "",
    },
    isActive: true,
    tags: ["drain", "grease"],
  },

  // 6. MICROFIBER MOPPING
  {
    serviceId: "microfiberMopping",
    version: "v1.0",
    label: "Microfiber Mopping",
    description: "Advanced floor mopping service",
    config: {
      includedBathroomRate: 10,
      hugeBathroomPricing: {
        enabled: true,
        ratePerSqFt: 10,
        sqFtUnit: 300,
        description: "For huge bathrooms charge $10 per 300 sq ft instead of $10 per bathroom.",
      },
      extraAreaPricing: {
        singleLargeAreaRate: 100,
        extraAreaSqFtUnit: 400,
        extraAreaRatePerUnit: 10,
        useHigherRate: true,
      },
      standalonePricing: {
        standaloneSqFtUnit: 200,
        standaloneRatePerUnit: 10,
        standaloneMinimum: 40,
        includeTripCharge: true,
      },
      chemicalProducts: {
        dailyChemicalPerGallon: 27.34,
        customerSelfMopping: true,
        waterOnlyBetweenServices: true,
      },
      equipmentProvision: {
        mopHandlesOnInstall: true,
        microfiberMopsLeftBehind: true,
        commercialGradeMicrofiber: true,
        designedWashes: 500,
        enhancedCleaningSpeed: 30,
        microfiberDensity: "High-density commercial-grade microfiber",
      },
      tripCharges: {
        insideBeltway: 75,
        outsideBeltway: 100,
        standard: 75,
        parkingFee: 0,
        waiveForAllInclusive: true,
      },
      allInclusiveIntegration: {
        includedInPackage: true,
        noAdditionalCharge: true,
        standardBathroomCoverage: true,
      },
      serviceIntegration: {
        recommendCombineWithSaniScrub: true,
        installUpkeepNeeded: true,
        preventsBacteriaSpread: true,
        optimalPairing: ["SaniScrub", "SaniClean", "RPM Windows"],
      },
      billingConversions: {
        weekly: {
          annualMultiplier: 52,
          monthlyMultiplier: 4.33,
        },
        biweekly: {
          annualMultiplier: 26,
          monthlyMultiplier: 2.17,
        },
        monthly: {
          annualMultiplier: 12,
          monthlyMultiplier: 1,
        },
        actualWeeksPerYear: 52,
        actualWeeksPerMonth: 4.33,
      },
      pricingRules: {
        canBundleWithSani: true,
        canPriceAsIncluded: true,
        customPricingForHugeBathrooms: true,
        alwaysIncludeTripChargeStandalone: false,
        authorizationRequired: {
          belowRedRates: true,
          authorizers: ["Franchise Owner", "VP of Sales"],
        },
      },
      rateCategories: {
        redRate: {
          multiplier: 1,
          commissionRate: "20%",
        },
        greenRate: {
          multiplier: 1.3,
          commissionRate: "25%",
        },
      },
      valueProposition: {
        bacterialReduction: true,
        costSavingsForCustomer: true,
        professionalEquipment: true,
        waterOnlyCleaning: true,
        enhancedEfficiency: true,
      },
      serviceSpecs: {
        microfiberSize: "24-inch commercial microfiber mop pads",
        microfiberQuality: "High-density commercial-grade microfiber",
        washLifecycle: 500,
        performanceEnhancement: "30% faster and more effective than traditional mops",
        bacteriaPrevention: "Not driving bacteria into grout between scrubs.",
      },
      defaultFrequency: "weekly",
      allowedFrequencies: ["weekly", "biweekly", "monthly"],
      serviceType: "microfiberMopping",
      category: "Floor Maintenance",
      availablePricingMethods: ["included_with_sani", "standalone", "extra_area", "huge_bathroom"],
    },
    defaultFormState: {
      serviceId: "microfiberMopping",
      bathrooms: 0,
      extraAreaSqFt: 0,
      frequency: "weekly",
      standalone: false,
      contractMonths: 12,
      notes: "",
    },
    isActive: true,
    tags: ["floor", "mopping"],
  },

  // 7. RPM WINDOWS
  {
    serviceId: "rpmWindows",
    version: "v1.0",
    label: "RPM Windows",
    description: "Professional window cleaning service",
    config: {
      smallWindowRate: 1.5,
      mediumWindowRate: 3.0,
      largeWindowRate: 7.0,
      tripCharge: 0,
      installMultiplierFirstTime: 3,
      installMultiplierClean: 1,
      frequencyMultipliers: {
        weekly: 1.0,
        biweekly: 1.25,
        monthly: 1.25,
        quarterly: 2.0,
        quarterlyFirstTime: 3.0,
      },
      annualFrequencies: {
        weekly: 52,
        biweekly: 26,
        monthly: 12,
        quarterly: 4,
      },
      monthlyConversions: {
        weekly: 4.33,
        actualWeeksPerMonth: 4.33,
        actualWeeksPerYear: 52,
      },
      rateCategories: {
        redRate: {
          multiplier: 1.0,
          commissionRate: "standard",
        },
        greenRate: {
          multiplier: 1.3,
          commissionRate: "3% above standard (up to 12%)",
        },
      },
      allowedFrequencies: ["Weekly", "Bi-Weekly", "Monthly", "Quarterly"],
      additionalServices: {
        mirrorCleaning: true,
        mirrorCleaningRate: "same as window cleaning rate",
      },
      businessRules: {
        quarterlyHandledByInstallers: true,
        installCanBeWaivedAsConcession: true,
        alwaysIncludeTripCharge: false,
        authorizationRequiredBelowRed: true,
        authorizers: ["Jeff", "Alex"],
      },
      contractOptions: {
        canIncludeInContract: true,
        compensateWithOtherServices: true,
      },
    },
    defaultFormState: {
      serviceId: "rpmWindows",
      smallWindows: 0,
      mediumWindows: 0,
      largeWindows: 0,
      frequency: "Monthly",
      installCondition: "firstTime",
      contractMonths: 12,
      notes: "",
    },
    isActive: true,
    tags: ["windows", "cleaning"],
  },

  // 8. CARPET CLEANING
  {
    serviceId: "carpetCleaning",
    version: "v1.0",
    label: "Carpet Cleaning",
    description: "Professional carpet cleaning service",
    config: {
      unitSqFt: 500,
      firstUnitRate: 250,
      additionalUnitRate: 125,
      perVisitMinimum: 250,
      installMultipliers: {
        dirty: 3,
        clean: 1,
      },
      frequencyMeta: {
        monthly: { visitsPerYear: 12 },
        twicePerMonth: { visitsPerYear: 24 },
        bimonthly: { visitsPerYear: 6 },
        quarterly: { visitsPerYear: 4 },
      },
    },
    defaultFormState: {
      serviceId: "carpetCleaning",
      squareFeet: 0,
      frequency: "monthly",
      installCondition: "clean",
      contractMonths: 12,
      notes: "",
    },
    isActive: true,
    tags: ["carpet", "cleaning"],
  },

  // 9. PURE JANITORIAL
  {
    version: "v2.0",
    serviceId: "pureJanitorial",
    label: "Pure Janitorial",
    description: "General janitorial services with recurring and one-time options",
    config: {
      baseHourlyRate: 30,
      shortJobHourlyRate: 50,
      minHoursPerVisit: 4,
      tieredPricing: [
        {
          upToMinutes: 15,
          price: 10,
          description: "0-15 minutes",
          addonOnly: true
        },
        {
          upToMinutes: 30,
          price: 20,
          description: "15-30 minutes",
          addonOnly: true,
          standalonePrice: 35
        },
        {
          upToHours: 1,
          price: 50,
          description: "30 min - 1 hour"
        },
        {
          upToHours: 2,
          price: 80,
          description: "1-2 hours"
        },
        {
          upToHours: 3,
          price: 100,
          description: "2-3 hours"
        },
        {
          upToHours: 4,
          price: 120,
          description: "3-4 hours"
        },
        {
          upToHours: 999,
          ratePerHour: 30,
          description: "4+ hours"
        }
      ],
      weeksPerMonth: 4.33,
      minContractMonths: 2,
      maxContractMonths: 36,
      dustingPlacesPerHour: 30,
      dustingPricePerPlace: 1,
      vacuumingDefaultHours: 1
    },
    defaultFormState: {
      serviceId: "pureJanitorial",
      serviceType: "recurring",
      manualHours: 0,
      vacuumingHours: 0,
      dustingPlaces: 0,
      addonTimeMinutes: 0,
      installation: false,
      contractMonths: 12,
      notes: ""
    },
    isActive: true,
    tags: ["janitorial", "hourly", "recurring"]
  },


  // 10. STRIP & WAX
  {
    serviceId: "stripWax",
    version: "v1.0",
    label: "Strip & Wax",
    description: "Floor strip and wax service",
    config: {
      weeksPerMonth: 4.33,
      minContractMonths: 2,
      maxContractMonths: 36,
      defaultFrequency: "weekly",
      defaultVariant: "standardFull",
      variants: {
        standardFull: {
          label: "Standard – full strip + sealant",
          ratePerSqFt: 0.75,
          minCharge: 550,
        },
        noSealant: {
          label: "No sealant – 4th coat free / discount",
          ratePerSqFt: 0.70,
          minCharge: 550,
        },
        wellMaintained: {
          label: "Well maintained – partial strip",
          ratePerSqFt: 0.40,
          minCharge: 400,
        },
      },
      rateCategories: {
        redRate: {
          multiplier: 1,
          commissionRate: "20%",
        },
        greenRate: {
          multiplier: 1.3,
          commissionRate: "25%",
        },
      },
    },
    defaultFormState: {
      serviceId: "stripWax",
      squareFeet: 0,
      variant: "standardFull",
      frequency: "weekly",
      contractMonths: 12,
      notes: "",
    },
    isActive: true,
    tags: ["floor", "maintenance"],
  },

  // 11. REFRESH POWER SCRUB - Updated to match frontend expectations
  {
    serviceId: "refreshPowerScrub",
    version: "v2.0",
    label: "Refresh Power Scrub",
    description: "Commercial kitchen and facility deep cleaning with area-specific pricing",
    config: {
      coreRates: {
        defaultHourlyRate: 200,
        perWorkerRate: 200,     // Rate per worker
        perHourRate: 400,       // Rate per hour
        tripCharge: 75,
        minimumVisit: 475,
      },
      areaSpecificPricing: {
        kitchen: {
          smallMedium: 1500,
          large: 2500,
        },
        frontOfHouse: 2500,
        patio: {
          standalone: 875,
          upsell: 500,
        },
      },
      squareFootagePricing: {
        fixedFee: 200,
        insideRate: 0.6,
        outsideRate: 0.4,
      },
      frequencyOptions: [
        "weekly",
        "biweekly",
        "monthly",
        "bimonthly",
        "quarterly"
      ],
      pricingTypes: [
        "preset",
        "perWorker",
        "perHour",
        "squareFeet",
        "custom"
      ],
      contractOptions: {
        minMonths: 2,
        maxMonths: 36,
        defaultMonths: 12,
      },
    },
    defaultFormState: {
      serviceId: "refreshPowerScrub",
      tripCharge: 75,
      hourlyRate: 200,
      minimumVisit: 475,
      frequency: "monthly",
      contractMonths: 12,
      dumpster: {
        enabled: false,
        pricingType: "preset",
        workers: 0,
        hours: 0,
        hourlyRate: 200,
        insideSqFt: 0,
        outsideSqFt: 0,
        insideRate: 0.6,
        outsideRate: 0.4,
        sqFtFixedFee: 200,
        customAmount: 0,
        kitchenSize: "smallMedium",
        patioMode: "standalone",
        frequencyLabel: "",
        contractMonths: 12,
      },
      patio: {
        enabled: false,
        pricingType: "preset",
        workers: 0,
        hours: 0,
        hourlyRate: 200,
        insideSqFt: 0,
        outsideSqFt: 0,
        insideRate: 0.6,
        outsideRate: 0.4,
        sqFtFixedFee: 200,
        customAmount: 0,
        kitchenSize: "smallMedium",
        patioMode: "standalone",
        frequencyLabel: "",
        contractMonths: 12,
      },
      walkway: {
        enabled: false,
        pricingType: "custom",
        workers: 0,
        hours: 0,
        hourlyRate: 200,
        insideSqFt: 0,
        outsideSqFt: 0,
        insideRate: 0.6,
        outsideRate: 0.4,
        sqFtFixedFee: 200,
        customAmount: 0,
        kitchenSize: "smallMedium",
        patioMode: "standalone",
        frequencyLabel: "",
        contractMonths: 12,
      },
      foh: {
        enabled: false,
        pricingType: "preset",
        workers: 0,
        hours: 0,
        hourlyRate: 200,
        insideSqFt: 0,
        outsideSqFt: 0,
        insideRate: 0.6,
        outsideRate: 0.4,
        sqFtFixedFee: 200,
        customAmount: 0,
        kitchenSize: "smallMedium",
        patioMode: "standalone",
        frequencyLabel: "",
        contractMonths: 12,
      },
      boh: {
        enabled: false,
        pricingType: "preset",
        workers: 0,
        hours: 0,
        hourlyRate: 200,
        insideSqFt: 0,
        outsideSqFt: 0,
        insideRate: 0.6,
        outsideRate: 0.4,
        sqFtFixedFee: 200,
        customAmount: 0,
        kitchenSize: "smallMedium",
        patioMode: "standalone",
        frequencyLabel: "",
        contractMonths: 12,
      },
      other: {
        enabled: false,
        pricingType: "custom",
        workers: 0,
        hours: 0,
        hourlyRate: 200,
        insideSqFt: 0,
        outsideSqFt: 0,
        insideRate: 0.6,
        outsideRate: 0.4,
        sqFtFixedFee: 200,
        customAmount: 0,
        kitchenSize: "smallMedium",
        patioMode: "standalone",
        frequencyLabel: "",
        contractMonths: 12,
      },
      notes: "",
    },
    isActive: true,
    tags: ["kitchen", "deep-cleaning", "facility-wide", "power-scrub"],
  },

  // 12. ELECTROSTATIC SPRAY
  {
    serviceId: "electrostaticSpray",
    version: "v1.0",
    label: "Electrostatic Spray",
    description: "Professional facility disinfection using electrostatic spraying",
    config: {
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
    },
    defaultFormState: {
      serviceId: "electrostaticSpray",
      pricingMethod: "byRoom",
      roomCount: 0,
      squareFeet: 0,
      frequency: "weekly",
      location: "standard",
      isCombinedWithSaniClean: false,
      contractMonths: 12,
      notes: "",
      ratePerRoom: 20,
      ratePerThousandSqFt: 50,
      tripChargePerVisit: 0,
    },
    isActive: true,
    tags: ["disinfection", "facility-wide", "electrostatic"],
  },
];

// ============================================================================
// PRODUCT CATALOG (from frontend)
// ============================================================================

const productCatalog = {
  version: "EnvNVA-2020115",
  lastUpdated: "2025-11-23",
  currency: "USD",
  isActive: true,
  note: "Product catalog migrated from frontend config",
  families: [
    {
      key: "floorProducts",
      label: "Floor Products",
      sortOrder: 1,
      products: [
        {
          key: "floor_daily",
          name: "Daily",
          familyKey: "floorProducts",
          kind: "floorCleaner",
          basePrice: {
            amount: 28,
            currency: "USD",
            uom: "gallon",
          },
        },
        {
          key: "floor_primo",
          name: "Primo",
          familyKey: "floorProducts",
          kind: "floorCleaner",
          basePrice: {
            amount: 24,
            currency: "USD",
            uom: "gallon",
          },
        },
        {
          key: "floor_surefoot_ez",
          name: "Surefoot EZ",
          familyKey: "floorProducts",
          kind: "degreaser",
          basePrice: {
            amount: 32,
            currency: "USD",
            uom: "gallon",
          },
          displayByAdmin: true,
        },
        {
          key: "floor_bad",
          name: "B.A.D.",
          familyKey: "floorProducts",
          kind: "degreaser",
          basePrice: {
            amount: 39,
            currency: "USD",
            uom: "gallon",
          },
        },
        {
          key: "floor_hero",
          name: "Hero",
          familyKey: "floorProducts",
          kind: "degreaser",
          basePrice: {
            amount: 29,
            currency: "USD",
            uom: "gallon",
          },
        },
        {
          key: "floor_butyl_deg",
          name: "Butyl Commercial Degreaser",
          familyKey: "floorProducts",
          kind: "degreaser",
          basePrice: {
            amount: 20,
            currency: "USD",
            uom: "gallon",
          },
        },
        {
          key: "floor_turquoise3",
          name: "Turquoise 3 (Pro-Con)",
          familyKey: "floorProducts",
          kind: "disinfectant",
          basePrice: {
            amount: 61,
            currency: "USD",
            uom: "gallon",
          },
        },
        {
          key: "floor_hiox_blue_planet",
          name: "Hiox Blue Planet (APC Peroxide)",
          familyKey: "floorProducts",
          kind: "degreaser",
          basePrice: {
            amount: 30,
            currency: "USD",
            uom: "gallon",
          },
        },
      ],
    },
    {
      key: "saniProducts",
      label: "Sani Products",
      sortOrder: 2,
      products: [
        {
          key: "sani_habc",
          name: "H.A.B.C. (High Acid Bowl Cleaner)",
          familyKey: "saniProducts",
          kind: "bowlCleaner",
          basePrice: {
            amount: 40,
            currency: "USD",
            uom: "gallon",
          },
        },
        {
          key: "sani_visclean",
          name: "Visclean",
          familyKey: "saniProducts",
          kind: "bowlCleaner",
          basePrice: {
            amount: 23,
            currency: "USD",
            uom: "gallon",
          },
        },
        {
          key: "sani_blue_planet_hospital",
          name: "Blue Planet Hospital Grade Disinfectant",
          familyKey: "saniProducts",
          kind: "disinfectant",
          basePrice: {
            amount: 11,
            currency: "USD",
            uom: "32oz",
          },
        },
        {
          key: "sani_sani_shield",
          name: "Sani Shield Clean-X",
          familyKey: "saniProducts",
          kind: "disinfectant",
          basePrice: {
            amount: 140,
            currency: "USD",
            uom: "gallon",
          },
        },
      ],
    },
    {
      key: "threeSink",
      label: "Three Sink Components",
      sortOrder: 3,
      products: [
        {
          key: "three_blue_diamond",
          name: "Blue Diamond Dish Detergent",
          familyKey: "threeSink",
          kind: "dishSoap",
          basePrice: {
            amount: 25,
            currency: "USD",
            uom: "gallon",
          },
        },
        {
          key: "three_dish_detergent_pink",
          name: "Dish Detergent (Pink)",
          familyKey: "threeSink",
          kind: "dishSoap",
          basePrice: {
            amount: 11,
            currency: "USD",
            uom: "gallon",
          },
        },
        {
          key: "three_grade_a",
          name: "Grade-A",
          familyKey: "threeSink",
          kind: "sanitizer",
          basePrice: {
            amount: 41,
            currency: "USD",
            uom: "gallon",
          },
        },
      ],
    },
    {
      key: "otherChemicals",
      label: "Other Chemicals",
      sortOrder: 4,
      products: [
        {
          key: "chem_activate_plus",
          name: "Activate Plus",
          familyKey: "otherChemicals",
          kind: "drainProduct",
          basePrice: {
            amount: 25,
            currency: "USD",
            uom: "gallon",
          },
        },
        {
          key: "chem_oven_cleaner",
          name: "Oven Cleaner",
          familyKey: "otherChemicals",
          kind: "other",
          basePrice: {
            amount: 29,
            currency: "USD",
            uom: "gallon",
          },
        },
        {
          key: "chem_health_guard_sanitizer",
          name: "Hand Sanitizer (Health Guard by Kutol)",
          familyKey: "otherChemicals",
          kind: "sanitizer",
          basePrice: {
            amount: 42,
            currency: "USD",
            uom: "gallon",
          },
        },
        {
          key: "chem_berry_good",
          name: "Berry Good Deodorant",
          familyKey: "otherChemicals",
          kind: "fragrance",
          basePrice: {
            amount: 11,
            currency: "USD",
            uom: "32oz",
          },
        },
        {
          key: "chem_repel_glass",
          name: "Repel Glass and Surface Cleaner",
          familyKey: "otherChemicals",
          kind: "other",
          basePrice: {
            amount: 14,
            currency: "USD",
            uom: "gallon",
          },
        },
        {
          key: "chem_invisible_shield",
          name: "Invisible Shield",
          familyKey: "otherChemicals",
          kind: "other",
          basePrice: {
            amount: 14,
            currency: "USD",
            uom: "gallon",
          },
        },
      ],
    },
    {
      key: "soap",
      label: "Soap Products",
      sortOrder: 5,
      products: [
        {
          key: "soap_foaming_pear",
          name: "Foaming Pear Hand Soap",
          familyKey: "soap",
          kind: "handSoap",
          basePrice: {
            amount: 30,
            currency: "USD",
            uom: "gallon",
          },
        },
        {
          key: "soap_white_lotion",
          name: "White Lotion Soap",
          familyKey: "soap",
          kind: "handSoap",
          basePrice: {
            amount: 25,
            currency: "USD",
            uom: "gallon",
          },
        },
      ],
    },
    // Paper and Dispensers sections truncated for brevity but follow the same pattern
    // from the frontend productsConfig.ts
  ],
};

// ============================================================================
// SEED FUNCTION
// ============================================================================

async function seedDatabase() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI || "mongodb://localhost:27017/enviromaster");
    console.log("✓ Connected to MongoDB");

    // Clear existing data
    console.log("\nClearing existing service configs and product catalogs...");
    await ServiceConfig.deleteMany({});
    await ProductCatalog.deleteMany({});
    console.log("✓ Cleared existing data");

    // Insert service configs
    console.log("\nInserting service configurations...");
    for (const config of serviceConfigs) {
      await ServiceConfig.create(config);
      console.log(`  ✓ Inserted ${config.label} (${config.serviceId})`);
    }
    console.log(`✓ Inserted ${serviceConfigs.length} service configurations`);

    // Insert product catalog
    console.log("\nInserting product catalog...");
    await ProductCatalog.create(productCatalog);
    console.log(`✓ Inserted product catalog (version: ${productCatalog.version})`);

    console.log("\n✅ Seed completed successfully!");
  } catch (error) {
    console.error("\n❌ Error seeding database:", error);
    throw error;
  } finally {
    await mongoose.connection.close();
    console.log("\n✓ Database connection closed");
  }
}

// Run the seed
seedDatabase().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
