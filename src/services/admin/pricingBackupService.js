import { BackupPricing } from "#models/admin/index.js";
import { PriceFix, ProductCatalog } from "#models/product/index.js";
import { ServiceConfig } from "#models/service/index.js";

class PricingBackupService {

  static async createBackupIfNeeded(options = {}) {
    try {
      const {
        trigger = 'manual',
        changedBy = null,
        changedAreas = [],
        changeDescription = '',
        changeCount = 1
      } = options;

      const hasBackupToday = await BackupPricing.hasBackupForToday();
      if (hasBackupToday) {
        return {
          success: true,
          skipped: true,
          message: 'Backup already exists for today',
          changeDay: BackupPricing.getCurrentDateString()
        };
      }

      const pricingSnapshot = await this.collectAllPricingData();

      const compressionResult = BackupPricing.compressPricingData(pricingSnapshot);

      const metadata = this.calculateSnapshotMetadata(pricingSnapshot, compressionResult);

      const changeDay = BackupPricing.getCurrentDateString();
      const changeDayId = BackupPricing.generateChangeDayId(changeDay);

      const backupRecord = new BackupPricing({
        changeDayId,
        changeDay,
        firstChangeTimestamp: new Date(),
        compressedSnapshot: compressionResult.compressedData,
        snapshotMetadata: metadata,
        backupTrigger: trigger,
        changedBy,
        changeContext: {
          changedAreas,
          changeDescription,
          changeCount
        }
      });

      await backupRecord.save();

      const retentionResult = await BackupPricing.enforceRetentionPolicy();

      return {
        success: true,
        created: true,
        backup: {
          id: backupRecord._id,
          changeDayId: backupRecord.changeDayId,
          changeDay: backupRecord.changeDay,
          originalSize: compressionResult.originalSize,
          compressedSize: compressionResult.compressedSize,
          compressionRatio: compressionResult.compressionRatio
        },
        retentionPolicy: retentionResult,
        message: 'Backup created successfully'
      };

    } catch (error) {
      console.error('Backup creation failed:', error);
      return {
        success: false,
        error: error.message,
        message: 'Failed to create pricing backup'
      };
    }
  }

  static async createManualBackup(options = {}) {
    try {
      const {
        changedBy = null,
        changedAreas = ['other'],
        changeDescription = 'Manual backup created by admin',
        changeCount = 1,
        forceReplace = false
      } = options;

      const changeDay = BackupPricing.getCurrentDateString();
      const manualChangeDayId = `backup_${changeDay}_manual`;

      const existingManualBackup = await BackupPricing.findOne({
        changeDayId: manualChangeDayId
      });

      if (existingManualBackup && !forceReplace) {
        return {
          success: false,
          requiresConfirmation: true,
          existingBackup: {
            changeDayId: existingManualBackup.changeDayId,
            createdAt: existingManualBackup.createdAt,
            changeDescription: existingManualBackup.changeContext?.changeDescription
          },
          message: 'A manual backup already exists for today. Do you want to replace it?'
        };
      }

      if (existingManualBackup && forceReplace) {
        await BackupPricing.deleteOne({ changeDayId: manualChangeDayId });
      }

      const pricingSnapshot = await this.collectAllPricingData();

      const compressionResult = BackupPricing.compressPricingData(pricingSnapshot);

      const metadata = this.calculateSnapshotMetadata(pricingSnapshot, compressionResult);

      const backupRecord = new BackupPricing({
        changeDayId: manualChangeDayId,
        changeDay,
        firstChangeTimestamp: new Date(),
        compressedSnapshot: compressionResult.compressedData,
        snapshotMetadata: metadata,
        backupTrigger: 'manual',
        changedBy,
        changeContext: {
          changedAreas,
          changeDescription: forceReplace ? `${changeDescription} (Replaced previous manual backup)` : changeDescription,
          changeCount
        }
      });

      await backupRecord.save();

      return {
        success: true,
        created: true,
        replaced: forceReplace,
        backup: {
          id: backupRecord._id,
          changeDayId: backupRecord.changeDayId,
          changeDay: backupRecord.changeDay,
          originalSize: compressionResult.originalSize,
          compressedSize: compressionResult.compressedSize,
          compressionRatio: compressionResult.compressionRatio
        },
        message: forceReplace
          ? `Manual backup replaced successfully for ${changeDay}`
          : `Manual backup created successfully for ${changeDay}`
      };

    } catch (error) {
      console.error('Manual backup creation failed:', error);
      return {
        success: false,
        error: error.message,
        message: 'Failed to create manual backup'
      };
    }
  }

  static async collectAllPricingData() {
    try {
      const priceFixes = await PriceFix.find({}).lean();

      const activeProductCatalog = await ProductCatalog.findOne({ isActive: true }).lean();

      const allProductCatalogs = await ProductCatalog.find({}).lean();

      const serviceConfigs = await ServiceConfig.find({}).lean();

      const snapshot = {
        timestamp: new Date().toISOString(),
        dataTypes: {
          priceFix: {
            documents: priceFixes,
            count: priceFixes.length
          },
          productCatalog: {
            active: activeProductCatalog,
            all: allProductCatalogs,
            activeCount: activeProductCatalog ? 1 : 0,
            totalCount: allProductCatalogs.length
          },
          serviceConfigs: {
            documents: serviceConfigs,
            count: serviceConfigs.length,
            activeCount: serviceConfigs.filter(config => config.isActive).length
          }
        },
        metadata: {
          backupVersion: '1.0',
          collectionTimestamp: new Date(),
          totalDocuments: priceFixes.length + allProductCatalogs.length + serviceConfigs.length
        }
      };

      return snapshot;

    } catch (error) {
      throw new Error(`Failed to collect pricing data: ${error.message}`);
    }
  }

  static calculateSnapshotMetadata(snapshot, compressionResult) {
    const { priceFix, productCatalog, serviceConfigs } = snapshot.dataTypes;

    let totalProductCount = 0;
    if (productCatalog.active && productCatalog.active.families) {
      totalProductCount = productCatalog.active.families.reduce((count, family) => {
        return count + (family.products ? family.products.length : 0);
      }, 0);
    }

    if (productCatalog.all && Array.isArray(productCatalog.all)) {
      productCatalog.all.forEach(catalog => {
        if (catalog.families && catalog !== productCatalog.active) {
          totalProductCount += catalog.families.reduce((count, family) => {
            return count + (family.products ? family.products.length : 0);
          }, 0);
        }
      });
    }

    return {
      includedDataTypes: {
        priceFix: true,
        productCatalog: true,
        serviceConfigs: true
      },
      documentCounts: {
        priceFixCount: priceFix.count,
        productCatalogCount: totalProductCount,
        serviceConfigCount: serviceConfigs.count
      },
      originalSize: compressionResult.originalSize,
      compressedSize: compressionResult.compressedSize,
      compressionRatio: compressionResult.compressionRatio
    };
  }

  static async restoreFromBackup(changeDayId, restoredBy, restorationNotes = '') {
    try {
      const backup = await BackupPricing.findOne({ changeDayId });
      if (!backup) {
        throw new Error(`Backup not found: ${changeDayId}`);
      }

      const snapshot = backup.getSnapshot();

      if (!snapshot.dataTypes) {
        throw new Error('Invalid backup snapshot structure');
      }

      const restorationResults = {
        priceFix: { restored: 0, errors: [] },
        productCatalog: { restored: 0, errors: [] },
        serviceConfigs: { restored: 0, errors: [] }
      };

      if (snapshot.dataTypes.priceFix.documents.length > 0) {
        try {
          await PriceFix.deleteMany({});
          const priceFixDocs = snapshot.dataTypes.priceFix.documents.map(doc => {
            delete doc._id;
            return doc;
          });
          await PriceFix.insertMany(priceFixDocs);
          restorationResults.priceFix.restored = priceFixDocs.length;
        } catch (error) {
          restorationResults.priceFix.errors.push(error.message);
        }
      }

      if (snapshot.dataTypes.productCatalog.all.length > 0) {
        try {
          await ProductCatalog.deleteMany({});
          const catalogDocs = snapshot.dataTypes.productCatalog.all.map(doc => {
            delete doc._id;
            return doc;
          });
          await ProductCatalog.insertMany(catalogDocs);
          restorationResults.productCatalog.restored = catalogDocs.length;
        } catch (error) {
          restorationResults.productCatalog.errors.push(error.message);
        }
      }

      if (snapshot.dataTypes.serviceConfigs.documents.length > 0) {
        try {
          await ServiceConfig.deleteMany({});
          const serviceConfigDocs = snapshot.dataTypes.serviceConfigs.documents.map(doc => {
            delete doc._id;
            return doc;
          });
          await ServiceConfig.insertMany(serviceConfigDocs);
          restorationResults.serviceConfigs.restored = serviceConfigDocs.length;
        } catch (error) {
          restorationResults.serviceConfigs.errors.push(error.message);
        }
      }

      backup.restorationInfo = {
        hasBeenRestored: true,
        lastRestoredAt: new Date(),
        restoredBy,
        restorationNotes
      };
      await backup.save();

      const totalRestored = restorationResults.priceFix.restored +
                           restorationResults.productCatalog.restored +
                           restorationResults.serviceConfigs.restored;

      const totalErrors = restorationResults.priceFix.errors.length +
                         restorationResults.productCatalog.errors.length +
                         restorationResults.serviceConfigs.errors.length;

      return {
        success: totalErrors === 0,
        changeDayId,
        changeDay: backup.changeDay,
        totalRestored,
        totalErrors,
        results: restorationResults,
        message: totalErrors === 0 ?
          `Successfully restored ${totalRestored} documents from ${backup.changeDay}` :
          `Restored ${totalRestored} documents with ${totalErrors} errors`
      };

    } catch (error) {
      console.error('Restoration failed:', error);
      return {
        success: false,
        error: error.message,
        message: 'Failed to restore pricing backup'
      };
    }
  }

  static async getAvailableBackups(limit = 10) {
    try {
      const startTime = Date.now();
      console.log(`[BACKUP-LIST] Starting optimized backup list fetch (limit: ${limit})...`);

      const backups = await BackupPricing.getLastNChangeDays(limit);
      const queryTime = Date.now() - startTime;

      console.log(`⚡ [BACKUP-LIST] Fetched ${backups.length} backups in ${queryTime}ms`);

      const backupSummary = backups.map((item, index) => {
        const changeDayId = item.backup.changeDayId;

        const documentCounts = {
          ...item.backup.snapshotMetadata.documentCounts
        };

        console.log(`[BACKUP-LIST] Backup ${index + 1}/${backups.length}: ${changeDayId} - ${documentCounts.productCatalogCount} products`);

        return {
          changeDayId: item.backup.changeDayId,
          changeDay: item.backup.changeDay,
          firstChangeTimestamp: item.backup.firstChangeTimestamp,
          backupTrigger: item.backup.backupTrigger,
          changeContext: {
            changedAreas: item.backup.changeContext.changedAreas,
            changeDescription: item.backup.changeContext.changeDescription,
            changeCount: item.backup.changeContext.changeCount
          },
          snapshotMetadata: {
            documentCounts: documentCounts,
            originalSize: item.backup.snapshotMetadata.originalSize,
            compressedSize: item.backup.snapshotMetadata.compressedSize,
            compressionRatio: item.backup.snapshotMetadata.compressionRatio,
            includedDataTypes: item.backup.snapshotMetadata.includedDataTypes
          },
          restorationInfo: {
            hasBeenRestored: item.backup.restorationInfo.hasBeenRestored,
            lastRestoredAt: item.backup.restorationInfo.lastRestoredAt
          },
          createdAt: item.backup.createdAt,
          updatedAt: item.backup.updatedAt,
          backupCount: item.backupCount
        };
      });

      const totalTime = Date.now() - startTime;
      console.log(`⚡ [BACKUP-LIST] Optimized list processing completed in ${totalTime}ms (${backupSummary.length} backups)`);

      return {
        success: true,
        backups: backupSummary,
        totalChangeDays: backups.length,
        message: `Found ${backups.length} backup change-days`,
        _metadata: {
          queryTime: `${totalTime}ms`,
          optimized: true,
          optimization: 'removed_snapshot_decompression',
          note: 'Using stored metadata counts instead of decompressing snapshots'
        }
      };

    } catch (error) {
      console.error('Failed to get available backups:', error);
      return {
        success: false,
        error: error.message,
        message: 'Failed to retrieve backup list'
      };
    }
  }

  static async getBackupDetails(changeDayId) {
    try {
      const backup = await BackupPricing.findOne({ changeDayId })
        .populate('changedBy', 'username email')
        .populate('restorationInfo.restoredBy', 'username email');

      if (!backup) {
        return {
          success: false,
          message: 'Backup not found'
        };
      }

      console.log(`[DEBUG] Processing backup details for ${changeDayId}`);
      console.log(`[DEBUG] Stored metadata productCatalogCount:`, backup.snapshotMetadata?.documentCounts?.productCatalogCount);

      let actualProductCount = backup.snapshotMetadata?.documentCounts?.productCatalogCount || 0;

      try {
        console.log(`[DEBUG] Attempting to decompress snapshot...`);

        let compressedData = backup.compressedSnapshot;
        if (compressedData && typeof compressedData === 'object' && compressedData.buffer) {
          compressedData = compressedData.buffer;
        }
        console.log(`[DEBUG] Compressed data type: ${typeof compressedData}, constructor: ${compressedData.constructor.name}`);

        const snapshot = BackupPricing.decompressPricingData(compressedData);
        console.log(`[DEBUG] Snapshot decompressed successfully`);
        console.log(`[DEBUG] Snapshot structure:`, {
          hasDataTypes: !!snapshot.dataTypes,
          hasProductCatalog: !!snapshot.dataTypes?.productCatalog,
          hasActive: !!snapshot.dataTypes?.productCatalog?.active,
          hasFamilies: !!snapshot.dataTypes?.productCatalog?.active?.families
        });

        if (snapshot.dataTypes?.productCatalog?.active?.families) {
          const families = snapshot.dataTypes.productCatalog.active.families;
          console.log(`[DEBUG] Found ${families.length} families in active catalog`);

          families.forEach((family, index) => {
            const productCount = family.products ? family.products.length : 0;
            console.log(`[DEBUG] Family ${index + 1} (${family.familyName || family.name || 'unnamed'}): ${productCount} products`);
          });

          actualProductCount = families.reduce((count, family) => {
            const familyProductCount = family.products ? family.products.length : 0;
            return count + familyProductCount;
          }, 0);

          console.log(`[DEBUG] Calculated total product count: ${actualProductCount}`);
        } else {
          console.log(`[DEBUG] No families found in snapshot structure`);
          console.log(`[DEBUG] Full productCatalog structure:`, JSON.stringify(snapshot.dataTypes?.productCatalog, null, 2));
        }
      } catch (error) {
        console.error(`[DEBUG] Error decompressing or processing snapshot:`, error);
        console.warn('Could not recalculate product count from snapshot, using stored metadata');
      }

      const correctedMetadata = {
        ...backup.snapshotMetadata,
        documentCounts: {
          ...backup.snapshotMetadata.documentCounts,
          productCatalogCount: actualProductCount
        }
      };

      console.log(`[DEBUG] Final product count being returned: ${actualProductCount}`);
      console.log(`[DEBUG] Corrected document counts:`, correctedMetadata.documentCounts);

      return {
        success: true,
        backup: {
          changeDayId: backup.changeDayId,
          changeDay: backup.changeDay,
          firstChangeTimestamp: backup.firstChangeTimestamp,
          backupTrigger: backup.backupTrigger,
          changedBy: backup.changedBy,
          changeContext: backup.changeContext,
          snapshotMetadata: correctedMetadata,
          restorationInfo: backup.restorationInfo,
          createdAt: backup.createdAt,
          updatedAt: backup.updatedAt
        },
        message: 'Backup details retrieved successfully'
      };

    } catch (error) {
      console.error('Failed to get backup details:', error);
      return {
        success: false,
        error: error.message,
        message: 'Failed to retrieve backup details'
      };
    }
  }

  static async deleteBackups(changeDayIds, deletedBy) {
    try {
      const deleteResult = await BackupPricing.deleteMany({
        changeDayId: { $in: changeDayIds }
      });

      return {
        success: true,
        deletedCount: deleteResult.deletedCount,
        deletedBackups: changeDayIds,
        deletedBy,
        message: `Successfully deleted ${deleteResult.deletedCount} backups`
      };

    } catch (error) {
      console.error('Failed to delete backups:', error);
      return {
        success: false,
        error: error.message,
        message: 'Failed to delete backups'
      };
    }
  }

  static async getBackupStatistics() {
    try {
      const startTime = Date.now();
      console.log('[BACKUP-STATS] Starting optimized statistics collection...');

      const statsData = await BackupPricing.aggregate([
        {
          $facet: {
            totalCount: [{ $count: 'count' }],

            uniqueChangeDays: [
              { $group: { _id: '$changeDay' } },
              { $count: 'count' }
            ],

            sizeStats: [
              {
                $group: {
                  _id: null,
                  totalOriginalSize: { $sum: '$snapshotMetadata.originalSize' },
                  totalCompressedSize: { $sum: '$snapshotMetadata.compressedSize' },
                  avgCompressionRatio: { $avg: '$snapshotMetadata.compressionRatio' },
                  minCompressionRatio: { $min: '$snapshotMetadata.compressionRatio' },
                  maxCompressionRatio: { $max: '$snapshotMetadata.compressionRatio' }
                }
              }
            ],

            triggerStats: [
              {
                $group: {
                  _id: '$backupTrigger',
                  count: { $sum: 1 }
                }
              }
            ],

            recentBackups: [
              { $sort: { changeDay: -1 } },
              { $limit: 5 },
              {
                $project: {
                  changeDayId: 1,
                  changeDay: 1,
                  backupTrigger: 1,
                  'snapshotMetadata.documentCounts': 1
                }
              }
            ]
          }
        }
      ]);

      const queryTime = Date.now() - startTime;

      const result = statsData[0];
      const totalBackups = result.totalCount[0]?.count || 0;
      const uniqueChangeDaysCount = result.uniqueChangeDays[0]?.count || 0;
      const sizeStats = result.sizeStats[0] || {};
      const triggerStats = result.triggerStats || [];
      const recentBackups = result.recentBackups || [];

      console.log(`⚡ [BACKUP-STATS] Optimized statistics collected in ${queryTime}ms`);

      return {
        success: true,
        statistics: {
          totalBackups,
          uniqueChangeDays: uniqueChangeDaysCount,
          retentionCompliance: uniqueChangeDaysCount <= 10,
          sizeStatistics: sizeStats,
          triggerStatistics: triggerStats,
          recentBackups: recentBackups,
          systemHealth: {
            isHealthy: uniqueChangeDaysCount <= 10 && totalBackups > 0,
            warnings: uniqueChangeDaysCount > 10 ?
              ['Retention policy may need enforcement'] : []
          }
        },
        message: 'Backup statistics retrieved successfully',
        _metadata: {
          queryTime: `${queryTime}ms`,
          optimized: true,
          queryType: 'single_aggregation_with_facet'
        }
      };

    } catch (error) {
      console.error('Failed to get backup statistics:', error);
      return {
        success: false,
        error: error.message,
        message: 'Failed to retrieve backup statistics'
      };
    }
  }
}

export default PricingBackupService;
