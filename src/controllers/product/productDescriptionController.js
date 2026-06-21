import mongoose from "mongoose";
import { COMPREHENSIVE_PRODUCT_DATA, SERVICE_PRICING } from "../../data/comprehensiveProductData.js";
import logger from "../../utils/logger.js";

const LEGACY_PRODUCT_DESCRIPTIONS = {
  floor_daily: "Water-based for daily floor cleaning. Excellent for regular maintenance cleaning.",
  floor_primo: "Water based multi purpose cleaner. High-quality cleaning solution for various surfaces.",
  floor_bad: "Super strength degreaser and floor finish remover. Toughest industrial soils as well as multiple layers of finish build-up. Alkaline and solvents.",
  floor_hero: "Concentrated degreaser. No harsh fumes or solvents so safe for food serving or processing areas.",
  floor_butyl_deg: "Degreaser for detergent-resistant surfaces (porcelain, chrome, quarry tile, countertops, tables).",
  floor_turquoise3: "(Pro-Con) EPA certified hospital grade disinfectant for all hard surfaces. Bacteria, virus and fungi.",
  floor_hiox_blue_planet: "Cleaner and degreaser for use on all types of hard surfaces. Peroxide, solvents, detergents, penetrating and soil lifting agents. Use on countertops, appliances, oven hoods, stainless steel, Formica®, plastic, fiberglass, rubber and glass.",

  sani_habc: "(High Acid Bowl Cleaner) Removes resistant stains from bathroom fixtures and porcelain.",
  sani_visclean: "Hydrochloric acid toilet bowl and restroom cleaner that is highly effective for removing heavy stains, soil, rust, scale, soap scum and hard water encrustations in toilet bowls, urinals, shower stalls.",
  sani_blue_planet_hospital: "Replaces the red/blue/green table cleaners. Food safe, so can be used in kitchen. Can be used for daily cleaning in bathrooms. Hospital grade disinfectant.",
  sani_sani_shield: "Clean-X (not Intercon). Hydrogen peroxide based. Cleans and applies a protective barrier coating to help reduce the growth of odor-causing bacteria, mold, and mildew stains in between cleaning.",

  three_blue_diamond: "Hand dish detergent for pots and pans. Multipurpose and labor saving. Good quality option.",
  three_dish_detergent_pink: "Manual pot and pan detergent. More cost effective than Blue Diamond but lesser quality.",
  three_grade_a: "Quick sanitizing cleaner for use on food processing equipment, food contact surfaces and utensils.",

  chem_activate_plus: "A concentrated blend of live liquid bacteria enzymes that activates drain lines and grease traps.",
  chem_oven_cleaner: "Cleaning ovens, grills, stainless steel surfaces, etc. Heavy-duty cleaning solution.",
  chem_health_guard_sanitizer: "62% aloe and Vitamin E. Non alcohol hand sanitizer meets CDC standards. Foaming hand sanitizer which is rare. Avoids risks of alcohol-based sanitizers: ingestion by children/pets and flammability.",
  chem_berry_good: "Deodorant that transforms the chemical structure of malodor molecules. For carpets, linens, in waste baskets, closets.",
  chem_repel_glass: "Glass and surface cleaner. Professional-grade cleaning solution.",
  chem_invisible_shield: "Lime scale remover for glass. Advanced cleaning technology.",

  soap_orange_premium: "Luxury soap that cleans and softens hands. Note this is sold ready to use not concentrated.",
  soap_foaming_pear: "Luxury soap popular with customers but expensive. High-quality foaming hand soap.",
  soap_white_lotion: "Quality lotion soap for general use. Good balance of quality and cost.",
  soap_low_quality_lotion: "Budget option for existing clients. We are migrating these clients to white lotion soap.",
  soap_grit_soap: "Heavy-duty hand soap designed for industrial and kitchen use with grit for tough cleaning.",

  paper_multifold_tower: "Multi-fold paper towels. Standard quality for high-traffic areas. Case contains 16 packs of 250 sheets.",
  paper_hardwound_kraft: "Hard-wound kraft paper towels. Natural color, good absorbency. Case of 6 rolls.",
  paper_hardwound_white: "Hard-wound white paper towels. Premium appearance and absorbency. Case of 6 rolls.",
  paper_household_toilet_tissue: "Standard household toilet tissue. Good quality for general use. Case of 96 rolls.",
  paper_jrt_generic: "Jumbo Roll Toilet Paper (JRT). Large capacity rolls for high-traffic restrooms. Case of 12 rolls.",
  paper_em_jrt_tissue: "EM Proprietary JRT Tissue. Enviro-Master branded jumbo rolls with excellent quality. Case of 12 rolls.",
  paper_em_hardwound_natural: "EM Proprietary Hardwood Natural. Enviro-Master branded natural kraft paper towels. Case of 6 rolls.",
  paper_em_hardwound_white: "EM Proprietary Hardwood White. Enviro-Master branded white paper towels. Premium quality. Case of 6 rolls.",
  paper_center_pull_towels: "Center Pull Towels. Convenient dispensing system reduces waste. Case of 6 rolls.",
  paper_multifold_natural: "Multi-Fold Natural. Natural kraft color multi-fold towels. Case of 16 packs.",
  paper_multifold_white: "Multi-Fold White. White multi-fold towels for premium appearance. Case of 16 packs.",
  paper_toilet_seat_covers: "Toilet Seat Covers. Hygienic protection for restroom users. Pack of 250 covers.",

  disp_manual_soap: "Enviro-Master Manual Soap Dispenser. Reliable manual operation with $1/week warranty.",
  disp_hybrid_soap: "Enviro-Master Hybrid Soap Dispenser. Battery and manual operation options with $2/week warranty.",
  disp_mechanical_towel: "Enviro-Master Mechanical Towel Dispenser. Hands-free operation with $2/week warranty.",
  disp_hybrid_towel: "Enviro-Master Hybrid Towel Dispenser. Advanced dispensing technology with $3/week warranty.",
  disp_air_freshener: "Enviro-Master Air Freshener (Battery). Automatic fragrance dispensing with $1/week warranty.",
  disp_jrt_dispenser: "Enviro-Master JRT Tissue Dispenser. Designed for jumbo roll tissue with $1/week warranty.",
  disp_legacy_tp: "Enviro-Master Legacy Toilet Paper Dispenser. Standard toilet paper dispensing with $1/week warranty.",
  disp_legacy_towel: "Enviro-Master Legacy Paper Towel Dispenser. Reliable towel dispensing with $2/week warranty.",
  disp_legacy_air_freshener: "Enviro-Master Legacy Air Freshener. Proven fragrance system with $1/week warranty.",
  disp_toilet_seat_dispenser: "Toilet Seat Dispenser. Convenient access to seat covers. Free warranty.",
  disp_toilet_paper_dispenser: "Toilet Paper Dispenser. Standard toilet paper dispensing with $1/week warranty.",
  disp_paper_towel_dispenser: "Paper Towel Dispenser. Basic towel dispensing with $1/week warranty.",
  disp_em_twin_jrt: "EM Proprietary Twin JRT. Twin roll system for high-capacity restrooms with $1/week warranty.",
  disp_em_towel_mech: "EM Proprietary Towel Mechanical. Enviro-Master mechanical towel dispenser with $2/week warranty.",
  disp_em_towel_hybrid: "EM Proprietary Towel Hybrid. Advanced Enviro-Master towel dispensing with $3/week warranty.",
  disp_center_pull_towel_dispenser: "Center Pull Towel Dispenser. Designed for center-pull towels with $1/week warranty.",
  disp_multifold_dispenser: "Multi-Fold Dispenser. Standard multi-fold towel dispensing with $1/week warranty.",
  disp_em_af_dispenser: "EM Proprietary A/F Dispensers. Enviro-Master air freshener dispensers with $1/week warranty.",
  disp_em_soap_dispenser: "EM Proprietary Soap Dispenser. Enviro-Master soap dispensing system with $1/week warranty.",
  disp_seat_cover_dispenser: "Seat Cover Dispenser. Hygienic seat cover dispensing. Free warranty.",
  disp_hand_sanitizer_dispenser: "Hand Sanitizer Dispenser. Convenient sanitizer dispensing with $1/week warranty.",
  disp_grit_soap_dispenser: "Grit Soap Dispenser. Heavy-duty soap dispensing for industrial use with $1/week warranty.",
  disp_sanipod_receptacle: "SaniPod Receptacle. Feminine hygiene disposal system with $3/week warranty.",

  extra_berry_good_case: "Berry Good (Case/12). Deodorant for transforming malodor molecules. Case of 12 - 32oz bottles.",
  extra_urinal_mats: "EM Urinal Mat. Reduces splashing and improves hygiene. Monthly replacement recommended.",
  extra_commode_mats: "EM Commode Mat. Floor protection and hygiene improvement around toilets.",
  extra_bowl_clip: "Bowl Clip. Toilet bowl freshener and cleaner. Includes case and bar. Case of 72.",
  extra_fragrance_bars: "Fragrance Bars. Long-lasting restroom fragrance. Case of 45 bars.",
  extra_urinal_screen: "Urinal Screen. Color reactive to urine to show effectiveness. Provides scent and splash protection. Case of 60.",
  extra_wave3d_urinal_screen: "Wave 3D Urinal Screen. Advanced 3D design for superior splash protection and fragrance.",
  extra_splash_hog_urinal_screen: "Splash Hog Urinal Screen. Premium urinal screen with enhanced splash protection.",
  extra_vertical_urinal_screen: "Vertical Urinal Screen. Specialized design for vertical urinal installations. Case of 72.",
  extra_microfiber_mop: "Microfiber Mop. High-quality cleaning mop for efficient floor maintenance. Case of 12.",
  extra_green_drain: "Green Drain. Shutter keeps anything from coming up, especially fruit flies. Case of 6.",
  extra_toilet_seat_cover_case: "Toilet Seat Cover Case. Bulk toilet seat covers for high-traffic restrooms. Case of 40.",
  extra_commercial_microfiber: "Commercial Cleaning Grade Microfiber. 16x24. 33% more microfiber than standard. Designed for 300 washes. 10% enhanced speed in cleaning tests. Case of 6.",
  extra_disposable_microfiber: "Disposable Microfiber. Allows microfiber solution without laundry requirements. Case of 50.",
  extra_daily_default: "Daily (Floor Cleaner). Default extra option for daily floor cleaning needs.",
  extra_surefoot_default: "Surefoot EZ (Default Extra). Foaming cleaner and degreaser designed for quarry tile floors.",
  extra_dish_detergent_default: "Dish Detergent (Default Extra). Standard dish cleaning solution for kitchen use."
};

export async function getProductCatalog(req, res) {
  try {
    const db = mongoose.connection.db;
    const catalog = await db.collection('productcatalogs').find({}).toArray();

    res.json({
      success: true,
      data: catalog
    });
  } catch (error) {
    logger.error('Error fetching product catalog:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch product catalog',
      detail: error.message
    });
  }
}

export async function addProductDescriptions(req, res) {
  try {
    const db = mongoose.connection.db;
    const collection = db.collection('productcatalogs');

    logger.debug('🔄 Adding descriptions to product catalog...');

    const catalog = await collection.findOne({ isActive: true });
    if (!catalog) {
      return res.status(404).json({
        success: false,
        error: 'Active product catalog not found'
      });
    }

    let updatedCount = 0;
    let skippedCount = 0;

    catalog.families.forEach(family => {
      family.products.forEach(product => {
        const description = PRODUCT_DESCRIPTIONS[product.key];
        if (description) {
          product.description = description;
          updatedCount++;
          logger.debug(`✅ Added description for ${product.key}: ${product.name}`);
        } else {
          skippedCount++;
          logger.debug(`⚠️  No description found for ${product.key}: ${product.name}`);
        }
      });
    });

    await collection.updateOne(
      { _id: catalog._id },
      {
        $set: {
          families: catalog.families,
          updatedAt: new Date()
        }
      }
    );

    logger.debug(`✅ Product descriptions update completed`);
    logger.debug(`📊 Updated: ${updatedCount}, Skipped: ${skippedCount}`);

    res.json({
      success: true,
      message: 'Product descriptions added successfully',
      stats: {
        totalProducts: updatedCount + skippedCount,
        updatedCount,
        skippedCount
      },
      catalog: catalog
    });

  } catch (error) {
    logger.error('Error adding product descriptions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add product descriptions',
      detail: error.message
    });
  }
}

export async function updateProductDescription(req, res) {
  try {
    const { productKey } = req.params;
    const { description } = req.body;

    if (!description) {
      return res.status(400).json({
        success: false,
        error: 'Description is required'
      });
    }

    const db = mongoose.connection.db;
    const collection = db.collection('productcatalogs');

    logger.debug(`🔄 Updating description for product: ${productKey}`);

    const result = await collection.updateOne(
      {
        isActive: true,
        'families.products.key': productKey
      },
      {
        $set: {
          'families.$[family].products.$[product].description': description,
          updatedAt: new Date()
        }
      },
      {
        arrayFilters: [
          { 'family.products.key': productKey },
          { 'product.key': productKey }
        ]
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        error: `Product with key '${productKey}' not found`
      });
    }

    logger.debug(`✅ Updated description for ${productKey}`);

    res.json({
      success: true,
      message: `Description updated for product: ${productKey}`,
      productKey,
      description
    });

  } catch (error) {
    logger.error('Error updating product description:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update product description',
      detail: error.message
    });
  }
}

export async function getMissingDescriptions(req, res) {
  try {
    const db = mongoose.connection.db;
    const collection = db.collection('productcatalogs');

    const catalog = await collection.findOne({ isActive: true });
    if (!catalog) {
      return res.status(404).json({
        success: false,
        error: 'Active product catalog not found'
      });
    }

    const missingDescriptions = [];
    const hasDescriptions = [];

    catalog.families.forEach(family => {
      family.products.forEach(product => {
        if (!product.description) {
          missingDescriptions.push({
            familyKey: family.key,
            familyLabel: family.label,
            productKey: product.key,
            productName: product.name,
            hasPresetDescription: !!LEGACY_PRODUCT_DESCRIPTIONS[product.key]
          });
        } else {
          hasDescriptions.push({
            familyKey: family.key,
            familyLabel: family.label,
            productKey: product.key,
            productName: product.name,
            description: product.description
          });
        }
      });
    });

    res.json({
      success: true,
      stats: {
        totalProducts: missingDescriptions.length + hasDescriptions.length,
        withDescriptions: hasDescriptions.length,
        missingDescriptions: missingDescriptions.length,
        availablePresets: missingDescriptions.filter(p => p.hasPresetDescription).length
      },
      missingDescriptions,
      hasDescriptions: hasDescriptions.slice(0, 10)
    });

  } catch (error) {
    logger.error('Error getting missing descriptions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get missing descriptions',
      detail: error.message
    });
  }
}

export async function addComprehensiveProductData(req, res) {
  try {
    const db = mongoose.connection.db;
    const collection = db.collection('productcatalogs');

    logger.debug('🔄 Adding comprehensive product data to catalog...');

    const catalog = await collection.findOne({ isActive: true });
    if (!catalog) {
      return res.status(404).json({
        success: false,
        error: 'Active product catalog not found'
      });
    }

    let updatedCount = 0;
    let skippedCount = 0;

    catalog.families.forEach(family => {
      family.products.forEach(product => {
        const comprehensiveData = COMPREHENSIVE_PRODUCT_DATA[product.key];
        if (comprehensiveData) {
          Object.assign(product, {
            description: comprehensiveData.description,
            category: comprehensiveData.category,
            features: comprehensiveData.features || [],
            applicationAreas: comprehensiveData.applicationAreas || [],
            pricePerGallon: comprehensiveData.pricePerGallon,
            pricePerCase: comprehensiveData.pricePerCase,
            pricePerUnit: comprehensiveData.pricePerUnit,
            unit: comprehensiveData.unit,
            effectivePricePerRoll: comprehensiveData.effectivePricePerRoll,
            customerPricePerRoll: comprehensiveData.customerPricePerRoll,
            warrantyPerWeek: comprehensiveData.warrantyPerWeek,
            warranty: comprehensiveData.warranty,
            packaging: comprehensiveData.packaging,
            benefits: comprehensiveData.benefits,
            certifications: comprehensiveData.certifications,
            positioning: comprehensiveData.positioning,
            replaces: comprehensiveData.replaces,
            effectiveAgainst: comprehensiveData.effectiveAgainst,
            requirement: comprehensiveData.requirement,
            status: comprehensiveData.status,
            concentration: comprehensiveData.concentration,
            brand: comprehensiveData.brand,
            dimensions: comprehensiveData.dimensions,
            specifications: comprehensiveData.specifications,
            installation: comprehensiveData.installation,
            note: comprehensiveData.note
          });
          updatedCount++;
          logger.debug(`✅ Added comprehensive data for ${product.key}: ${product.name}`);
        } else {
          const legacyDescription = LEGACY_PRODUCT_DESCRIPTIONS[product.key];
          if (legacyDescription && !product.description) {
            product.description = legacyDescription;
            updatedCount++;
            logger.debug(`⚠️ Added legacy description for ${product.key}: ${product.name}`);
          } else {
            skippedCount++;
            logger.debug(`⚠️ No comprehensive or legacy data found for ${product.key}: ${product.name}`);
          }
        }
      });
    });

    await collection.updateOne(
      { _id: catalog._id },
      {
        $set: {
          families: catalog.families,
          updatedAt: new Date(),
          hasComprehensiveData: true
        }
      }
    );

    logger.debug(`✅ Comprehensive product data update completed`);
    logger.debug(`📊 Updated: ${updatedCount}, Skipped: ${skippedCount}`);

    res.json({
      success: true,
      message: 'Comprehensive product data added successfully',
      stats: {
        totalProducts: updatedCount + skippedCount,
        updatedCount,
        skippedCount,
        comprehensiveDataCount: Object.keys(COMPREHENSIVE_PRODUCT_DATA).length
      },
      catalog: catalog
    });

  } catch (error) {
    logger.error('Error adding comprehensive product data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add comprehensive product data',
      detail: error.message
    });
  }
}

export async function getComprehensiveProductData(req, res) {
  try {
    const { category, search, includeServicePricing } = req.query;

    let products = { ...COMPREHENSIVE_PRODUCT_DATA };

    if (category) {
      products = Object.fromEntries(
        Object.entries(products).filter(([key, product]) =>
          product.category?.toLowerCase().includes(category.toLowerCase())
        )
      );
    }

    if (search) {
      const searchTerm = search.toLowerCase();
      products = Object.fromEntries(
        Object.entries(products).filter(([key, product]) =>
          product.name?.toLowerCase().includes(searchTerm) ||
          product.description?.toLowerCase().includes(searchTerm) ||
          key.toLowerCase().includes(searchTerm)
        )
      );
    }

    const responseData = {
      success: true,
      totalProducts: Object.keys(products).length,
      products: products,
      categories: [...new Set(Object.values(COMPREHENSIVE_PRODUCT_DATA).map(p => p.category))],
      filters: {
        category: category || null,
        search: search || null
      }
    };

    if (includeServicePricing === 'true') {
      responseData.servicePricing = SERVICE_PRICING;
    }

    res.json(responseData);

  } catch (error) {
    logger.error('Error getting comprehensive product data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get comprehensive product data',
      detail: error.message
    });
  }
}

export async function getServicePricing(req, res) {
  try {
    const { service } = req.query;

    if (service) {
      const serviceData = SERVICE_PRICING[service];
      if (!serviceData) {
        return res.status(404).json({
          success: false,
          error: `Service '${service}' not found`
        });
      }

      res.json({
        success: true,
        service: service,
        pricing: serviceData
      });
    } else {
      res.json({
        success: true,
        servicePricing: SERVICE_PRICING,
        availableServices: Object.keys(SERVICE_PRICING)
      });
    }

  } catch (error) {
    logger.error('Error getting service pricing:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get service pricing',
      detail: error.message
    });
  }
}

export async function getProductsByCategory(req, res) {
  try {
    const { category } = req.params;
    const { includePricing, includeFeatures } = req.query;

    const categoryProducts = Object.fromEntries(
      Object.entries(COMPREHENSIVE_PRODUCT_DATA).filter(([key, product]) =>
        product.category?.toLowerCase() === category.toLowerCase()
      )
    );

    if (Object.keys(categoryProducts).length === 0) {
      return res.status(404).json({
        success: false,
        error: `No products found for category '${category}'`,
        availableCategories: [...new Set(Object.values(COMPREHENSIVE_PRODUCT_DATA).map(p => p.category))]
      });
    }

    let responseProducts = categoryProducts;
    if (includePricing === 'false') {
      responseProducts = Object.fromEntries(
        Object.entries(categoryProducts).map(([key, product]) => [
          key,
          {
            ...product,
            pricePerGallon: undefined,
            pricePerCase: undefined,
            pricePerUnit: undefined,
            effectivePricePerRoll: undefined,
            customerPricePerRoll: undefined,
            warrantyPerWeek: undefined
          }
        ])
      );
    }

    if (includeFeatures === 'false') {
      responseProducts = Object.fromEntries(
        Object.entries(responseProducts).map(([key, product]) => [
          key,
          {
            ...product,
            features: undefined,
            applicationAreas: undefined,
            benefits: undefined
          }
        ])
      );
    }

    res.json({
      success: true,
      category: category,
      totalProducts: Object.keys(responseProducts).length,
      products: responseProducts
    });

  } catch (error) {
    logger.error('Error getting products by category:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get products by category',
      detail: error.message
    });
  }
}

export async function getPricingSummary(req, res) {
  try {
    const pricingSummary = {
      byCategory: {},
      priceRanges: {
        perGallon: { min: null, max: null, products: [] },
        perCase: { min: null, max: null, products: [] },
        perUnit: { min: null, max: null, products: [] }
      },
      totalProducts: 0,
      productsWithPricing: 0
    };

    Object.entries(COMPREHENSIVE_PRODUCT_DATA).forEach(([key, product]) => {
      pricingSummary.totalProducts++;

      if (product.category) {
        if (!pricingSummary.byCategory[product.category]) {
          pricingSummary.byCategory[product.category] = {
            count: 0,
            avgPrice: 0,
            priceRange: { min: null, max: null },
            products: []
          };
        }
        pricingSummary.byCategory[product.category].count++;
        pricingSummary.byCategory[product.category].products.push({
          key: key,
          name: product.name,
          price: product.pricePerGallon || product.pricePerCase || product.pricePerUnit || 0
        });
      }

      if (product.pricePerGallon) {
        pricingSummary.productsWithPricing++;
        const gallonRange = pricingSummary.priceRanges.perGallon;
        if (gallonRange.min === null || product.pricePerGallon < gallonRange.min) {
          gallonRange.min = product.pricePerGallon;
        }
        if (gallonRange.max === null || product.pricePerGallon > gallonRange.max) {
          gallonRange.max = product.pricePerGallon;
        }
        gallonRange.products.push({ key, name: product.name, price: product.pricePerGallon });
      }

      if (product.pricePerCase) {
        pricingSummary.productsWithPricing++;
        const caseRange = pricingSummary.priceRanges.perCase;
        if (caseRange.min === null || product.pricePerCase < caseRange.min) {
          caseRange.min = product.pricePerCase;
        }
        if (caseRange.max === null || product.pricePerCase > caseRange.max) {
          caseRange.max = product.pricePerCase;
        }
        caseRange.products.push({ key, name: product.name, price: product.pricePerCase });
      }

      if (product.pricePerUnit && typeof product.pricePerUnit === 'number') {
        pricingSummary.productsWithPricing++;
        const unitRange = pricingSummary.priceRanges.perUnit;
        if (unitRange.min === null || product.pricePerUnit < unitRange.min) {
          unitRange.min = product.pricePerUnit;
        }
        if (unitRange.max === null || product.pricePerUnit > unitRange.max) {
          unitRange.max = product.pricePerUnit;
        }
        unitRange.products.push({ key, name: product.name, price: product.pricePerUnit });
      }
    });

    Object.keys(pricingSummary.byCategory).forEach(category => {
      const categoryData = pricingSummary.byCategory[category];
      const prices = categoryData.products.map(p => p.price).filter(p => p > 0);
      if (prices.length > 0) {
        categoryData.avgPrice = prices.reduce((sum, price) => sum + price, 0) / prices.length;
        categoryData.priceRange.min = Math.min(...prices);
        categoryData.priceRange.max = Math.max(...prices);
      }
    });

    res.json({
      success: true,
      pricingSummary: pricingSummary,
      servicePricing: SERVICE_PRICING
    });

  } catch (error) {
    logger.error('Error getting pricing summary:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get pricing summary',
      detail: error.message
    });
  }
}

export async function getAvailableCategories(req, res) {
  try {
    const categories = [...new Set(Object.values(COMPREHENSIVE_PRODUCT_DATA).map(p => p.category))];
    const categoriesWithCounts = categories.map(category => ({
      name: category,
      productCount: Object.values(COMPREHENSIVE_PRODUCT_DATA).filter(p => p.category === category).length
    }));

    res.json({
      success: true,
      totalCategories: categories.length,
      categories: categoriesWithCounts,
      totalProducts: Object.keys(COMPREHENSIVE_PRODUCT_DATA).length
    });

  } catch (error) {
    logger.error('Error getting available categories:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get available categories',
      detail: error.message
    });
  }
}
