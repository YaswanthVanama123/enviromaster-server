# Service Configs and Product Catalog - Postman JSON Files

This directory contains JSON files that can be used directly in Postman to seed your database with service configurations and product catalogs.

## Files

1. **serviceConfigs.json** - Array of 11 service configurations
2. **productCatalog.json** - Complete product catalog with all families and products

## How to Use in Postman

### 1. Insert Service Configurations (Individual)

**Endpoint:** `POST /api/service-configs`

**Steps:**
1. Open Postman
2. Create a new POST request to: `http://localhost:5000/api/service-configs`
3. Go to the **Body** tab
4. Select **raw** and choose **JSON** from the dropdown
5. Open `serviceConfigs.json` and copy ONE service object (e.g., the saniclean object)
6. Paste it into the Body
7. Click **Send**

**Example - Single Service Config:**
```json
{
  "serviceId": "saniclean",
  "version": "v1.0",
  "label": "SaniClean - Restroom & Hygiene",
  "description": "Comprehensive restroom sanitization service",
  "config": {
    "geographicPricing": {
      "insideBeltway": {
        "ratePerFixture": 7,
        "weeklyMinimum": 40,
        "tripCharge": 0,
        "parkingFee": 0
      },
      ...
    }
  },
  "defaultFormState": { ... },
  "isActive": true,
  "tags": ["restroom", "hygiene", "core-service"]
}
```

**Repeat for each service:**
- SaniClean
- SaniPod
- SaniScrub
- Foaming Drain
- Grease Trap
- Microfiber Mopping
- RPM Windows
- Carpet Cleaning
- Pure Janitorial
- Strip & Wax
- Refresh Power Scrub

### 2. Insert Product Catalog

**Endpoint:** `POST /api/product-catalog`

**Steps:**
1. Open Postman
2. Create a new POST request to: `http://localhost:5000/api/product-catalog`
3. Go to the **Body** tab
4. Select **raw** and choose **JSON** from the dropdown
5. Open `productCatalog.json` and copy the ENTIRE contents
6. Paste it into the Body
7. Click **Send**

**Example - Product Catalog (truncated):**
```json
{
  "version": "EnvNVA-2020115",
  "lastUpdated": "2025-11-23",
  "currency": "USD",
  "isActive": true,
  "note": "Product catalog from frontend config",
  "families": [
    {
      "key": "floorProducts",
      "label": "Floor Products",
      "sortOrder": 1,
      "products": [
        {
          "key": "floor_daily",
          "name": "Daily",
          "familyKey": "floorProducts",
          "kind": "floorCleaner",
          "basePrice": {
            "amount": 28,
            "currency": "USD",
            "uom": "gallon"
          }
        },
        ...
      ]
    },
    ...
  ]
}
```

## API Endpoints Reference

### Service Configs
- **Create:** `POST /api/service-configs`
- **Get All:** `GET /api/service-configs`
- **Get Active:** `GET /api/service-configs/active`
- **Get by ServiceId:** `GET /api/service-configs/active?serviceId=saniclean`
- **Get by ID:** `GET /api/service-configs/:id`
- **Update:** `PUT /api/service-configs/:id`
- **Partial Update:** `PUT /api/service-configs/:id/partial`

### Product Catalog
- **Create:** `POST /api/product-catalog`
- **Get Active:** `GET /api/product-catalog/active`
- **Get All:** `GET /api/product-catalog`
- **Get by ID:** `GET /api/product-catalog/:id`
- **Update:** `PUT /api/product-catalog/:id`

## Service IDs

The following service IDs are available in the configs:
- `saniclean` - SaniClean restroom hygiene service
- `sanipod` - Feminine hygiene disposal
- `saniscrub` - Deep cleaning bathroom scrub
- `foamingDrain` - Drain treatment
- `greaseTrap` - Grease trap service
- `microfiberMopping` - Floor mopping
- `rpmWindows` - Window cleaning
- `carpetCleaning` - Carpet cleaning
- `pureJanitorial` - Janitorial services
- `stripWax` - Floor strip & wax
- `refreshPowerScrub` - Kitchen deep cleaning

## Product Families

The product catalog includes the following families:
1. **floorProducts** - Floor cleaners and degreasers (8 products)
2. **saniProducts** - Restroom cleaners and disinfectants (4 products)
3. **threeSink** - Dish detergents and sanitizers (3 products)
4. **otherChemicals** - Drain, oven cleaners, sanitizers (6 products)
5. **soap** - Hand soaps (2 products)
6. **paper** - Paper products and towels (12 products)
7. **dispensers** - All types of dispensers (23 products)
8. **extras** - Mats, screens, microfiber, etc. (17 products)

**Total: 75+ products**

## Notes

- All keys are in double quotes for valid JSON format
- All service configs have `isActive: true` by default
- All numeric values match exactly from the frontend configuration
- Product catalog includes all pricing, warranty, and quantity information
- Files are ready to copy-paste directly into Postman

## Authentication

If your API requires authentication, add the Authorization header:
1. Go to the **Headers** tab in Postman
2. Add key: `Authorization`
3. Add value: `Bearer <your-admin-token>`

To get a token, login first:
```
POST /api/admin/login
Body:
{
  "username": "envimaster",
  "password": "9999999999"
}
```

## Verification

After inserting the data, verify it's working:

1. Get active service configs: `GET /api/service-configs/active`
2. Get active product catalog: `GET /api/product-catalog/active`
3. Get specific service: `GET /api/service-configs/active?serviceId=saniclean`
