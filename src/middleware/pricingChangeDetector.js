import PricingBackupService from '../services/pricingBackupService.js';

class PricingChangeDetector {

  static async beforePriceFixUpdate(req, res, next) {
    try {
      const changedBy = req.user ? req.user._id : null;
      const adminUsername = req.user ? req.user.username : 'Unknown';

      const changedAreas = PricingChangeDetector.detectPriceFixChangedAreas(req.body);

      const changeDescription = `PriceFix update by ${adminUsername}: ${changedAreas.join(', ')}`;

      console.log(`[Pricing Backup] Triggering backup before PriceFix update by ${adminUsername}`);

      const backupResult = await PricingBackupService.createBackupIfNeeded({
        trigger: 'pricefix_update',
        changedBy,
        changedAreas,
        changeDescription,
        changeCount: Object.keys(req.body).length
      });

      if (backupResult.success) {
        if (backupResult.created) {
          console.log(`[Pricing Backup] Backup created: ${backupResult.backup.changeDayId}`);
          req.pricingBackupCreated = true;
          req.pricingBackupId = backupResult.backup.changeDayId;
        } else if (backupResult.skipped) {
          console.log(`[Pricing Backup] Backup skipped: ${backupResult.message}`);
          req.pricingBackupSkipped = true;
        }
      } else {
        console.error(`[Pricing Backup] Backup failed: ${backupResult.message}`);
        req.pricingBackupError = backupResult.error;
      }

      next();

    } catch (error) {
      console.error('[Pricing Backup] Middleware error:', error);
      req.pricingBackupError = error.message;
      next();
    }
  }

  static async beforeProductCatalogUpdate(req, res, next) {
    try {
      const changedBy = req.user ? req.user._id : null;
      const adminUsername = req.user ? req.user.username : 'Unknown';

      const isPartialUpdate = req.route.path.includes('/partial');
      const changedAreas = PricingChangeDetector.detectProductCatalogChangedAreas(req.body, isPartialUpdate);

      const changeDescription = `ProductCatalog ${isPartialUpdate ? 'partial' : 'full'} update by ${adminUsername}: ${changedAreas.join(', ')}`;

      console.log(`[Pricing Backup] *** PRODUCT CATALOG UPDATE DETECTED ***`);
      console.log(`[Pricing Backup] Route: ${req.method} ${req.route.path}`);
      console.log(`[Pricing Backup] Admin: ${adminUsername}`);
      console.log(`[Pricing Backup] Request body keys: ${Object.keys(req.body).join(', ')}`);
      console.log(`[Pricing Backup] Triggering backup before ProductCatalog update by ${adminUsername}`);

      const backupResult = await PricingBackupService.createBackupIfNeeded({
        trigger: 'product_catalog_update',
        changedBy,
        changedAreas,
        changeDescription,
        changeCount: PricingChangeDetector.countProductCatalogChanges(req.body, isPartialUpdate)
      });

      if (backupResult.success) {
        if (backupResult.created) {
          console.log(`[Pricing Backup] Backup created: ${backupResult.backup.changeDayId}`);
          req.pricingBackupCreated = true;
          req.pricingBackupId = backupResult.backup.changeDayId;
        } else if (backupResult.skipped) {
          console.log(`[Pricing Backup] Backup skipped: ${backupResult.message}`);
          req.pricingBackupSkipped = true;
        }
      } else {
        console.error(`[Pricing Backup] Backup failed: ${backupResult.message}`);
        req.pricingBackupError = backupResult.error;
      }

      next();

    } catch (error) {
      console.error('[Pricing Backup] Middleware error:', error);
      req.pricingBackupError = error.message;
      next();
    }
  }

  static async beforeServiceConfigUpdate(req, res, next) {
    try {
      const changedBy = req.user ? req.user._id : null;
      const adminUsername = req.user ? req.user.username : 'Unknown';

      const serviceId = req.body.serviceId || req.params.serviceId || 'unknown';
      const isPartialUpdate = req.route.path.includes('/partial');
      const changedAreas = PricingChangeDetector.detectServiceConfigChangedAreas(serviceId, req.body, isPartialUpdate);

      const changeDescription = `ServiceConfig ${isPartialUpdate ? 'partial' : 'full'} update for ${serviceId} by ${adminUsername}`;

      console.log(`[Pricing Backup] Triggering backup before ServiceConfig update by ${adminUsername}`);

      const backupResult = await PricingBackupService.createBackupIfNeeded({
        trigger: 'service_config_update',
        changedBy,
        changedAreas,
        changeDescription,
        changeCount: Object.keys(req.body).length
      });

      if (backupResult.success) {
        if (backupResult.created) {
          console.log(`[Pricing Backup] Backup created: ${backupResult.backup.changeDayId}`);
          req.pricingBackupCreated = true;
          req.pricingBackupId = backupResult.backup.changeDayId;
        } else if (backupResult.skipped) {
          console.log(`[Pricing Backup] Backup skipped: ${backupResult.message}`);
          req.pricingBackupSkipped = true;
        }
      } else {
        console.error(`[Pricing Backup] Backup failed: ${backupResult.message}`);
        req.pricingBackupError = backupResult.error;
      }

      next();

    } catch (error) {
      console.error('[Pricing Backup] Middleware error:', error);
      req.pricingBackupError = error.message;
      next();
    }
  }

  static detectPriceFixChangedAreas(requestBody) {
    const changedAreas = [];

    if (!requestBody.services) {
      return ['other'];
    }

    const services = requestBody.services;

    if (services.restroomHygiene) changedAreas.push('pricefix_services');
    if (services.foamingDrain) changedAreas.push('pricefix_services');
    if (services.scrubService) changedAreas.push('pricefix_services');
    if (services.handSanitizer) changedAreas.push('pricefix_services');
    if (services.micromaxFloor) changedAreas.push('pricefix_services');
    if (services.rpmWindow) changedAreas.push('pricefix_services');
    if (services.saniPod) changedAreas.push('pricefix_services');
    if (services.tripCharge) changedAreas.push('pricefix_tripcharge');

    return changedAreas.length > 0 ? changedAreas : ['pricefix_services'];
  }

  static detectProductCatalogChangedAreas(requestBody, isPartialUpdate) {
    const changedAreas = [];

    if (requestBody.families) {
      if (Array.isArray(requestBody.families)) {
        requestBody.families.forEach(family => {
          if (family.products) {
            changedAreas.push('product_catalog_products');
          }
        });
      }
      changedAreas.push('product_catalog_families');
    }

    if (isPartialUpdate) {
      Object.keys(requestBody).forEach(key => {
        if (key !== 'families' && key !== 'version' && key !== 'lastUpdated') {
          changedAreas.push('product_catalog_products');
        }
      });
    }

    return changedAreas.length > 0 ? changedAreas : ['product_catalog_families'];
  }

  static detectServiceConfigChangedAreas(serviceId, requestBody, isPartialUpdate) {
    const serviceMapping = {
      'saniclean': 'service_config_saniclean',
      'foamingdrain': 'service_config_foamingdrain',
      'scrubservice': 'service_config_scrubservice',
      'saniscrub': 'service_config_scrubservice',
      'handsanitizer': 'service_config_handsanitizer',
      'micromaxfloor': 'service_config_micromaxfloor',
      'microfibermopping': 'service_config_micromaxfloor',
      'rpmwindow': 'service_config_rpmwindow',
      'rpmwindows': 'service_config_rpmwindow',
      'sanipod': 'service_config_sanipod'
    };

    const mappedService = serviceMapping[serviceId.toLowerCase()] || 'service_config_custom';
    return [mappedService];
  }

  static countProductCatalogChanges(requestBody, isPartialUpdate) {
    let changeCount = 0;

    if (requestBody.families && Array.isArray(requestBody.families)) {
      requestBody.families.forEach(family => {
        if (family.products && Array.isArray(family.products)) {
          changeCount += family.products.length;
        } else {
          changeCount += 1;
        }
      });
    }

    if (isPartialUpdate) {
      changeCount += Object.keys(requestBody).length;
    }

    return Math.max(changeCount, 1);
  }

  static addBackupInfoToResponse(req, res, next) {
    const originalJson = res.json;

    res.json = function(body) {
      if (req.pricingBackupCreated || req.pricingBackupSkipped || req.pricingBackupError) {
        body.pricingBackup = {
          backupCreated: req.pricingBackupCreated || false,
          backupSkipped: req.pricingBackupSkipped || false,
          backupId: req.pricingBackupId || null,
          backupError: req.pricingBackupError || null
        };
      }

      originalJson.call(this, body);
    };

    next();
  }
}

export default PricingChangeDetector;
