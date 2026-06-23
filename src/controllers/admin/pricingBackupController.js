import PricingBackupService from "../../services/pricingBackupService.js";
import { BackupPricing as PricingBackup } from "../../models/admin/index.js";
import logger from "../../utils/logger.js";
import mongoose from "mongoose";

function toAdminUserId(...candidates) {
  for (const c of candidates) {
    if (c && mongoose.Types.ObjectId.isValid(c)) return c;
  }
  return null;
}

class PricingBackupController {
  static async createManualBackup(req, res) {
    try {
      const { reason, createdBy, changeDescription, forceReplace } = req.body;

      const result = await PricingBackupService.createManualBackup({
        changedBy: toAdminUserId(req.body.createdBy, req.admin?.id, req.user?.id),
        changeDescription: changeDescription || reason || "Manual backup",
        forceReplace: forceReplace === true
      });

      if (result.requiresConfirmation) {
        return res.status(409).json({
          success: false,
          requiresConfirmation: true,
          existingBackup: result.existingBackup,
          message: result.message
        });
      }

      if (result.success) {
        res.status(201).json({
          success: true,
          message: result.message,
          data: result.backup
        });
      } else {
        res.status(500).json({
          success: false,
          error: result.error,
          message: result.message
        });
      }
    } catch (error) {
      logger.error("Error creating manual backup:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  static async getBackupList(req, res) {
    try {
      const { limit = 10 } = req.query;

      const result = await PricingBackupService.getAvailableBackups(parseInt(limit));

      if (result.success) {
        res.json({
          success: true,
          data: result.backups,
          totalChangeDays: result.totalChangeDays,
          requestedLimit: parseInt(limit),
          message: result.message
        });
      } else {
        res.status(500).json({
          success: false,
          error: result.error,
          message: result.message
        });
      }
    } catch (error) {
      logger.error("Error getting backup list:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  static async getBackupDetails(req, res) {
    try {
      const { changeDayId } = req.params;

      const result = await PricingBackupService.getBackupDetails(changeDayId);

      if (result.success) {
        res.json({
          success: true,
          data: result.backup,
          message: result.message
        });
      } else {
        res.status(404).json({
          success: false,
          error: result.error || "Backup not found",
          message: result.message
        });
      }
    } catch (error) {
      logger.error("Error getting backup details:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  static async restoreFromBackup(req, res) {
    try {
      const { changeDayId, restorationNotes } = req.body;
      const restoredBy = toAdminUserId(req.admin?.id, req.user?.id, req.body.restoredBy);

      if (!changeDayId) {
        return res.status(400).json({
          success: false,
          error: "changeDayId is required"
        });
      }

      const result = await PricingBackupService.restoreFromBackup(
        changeDayId,
        restoredBy,
        restorationNotes || ""
      );

      if (result.success) {
        res.json({
          success: true,
          message: result.message,
          data: {
            changeDayId: result.changeDayId,
            changeDay: result.changeDay,
            totalRestored: result.totalRestored,
            results: result.results
          }
        });
      } else {
        res.status(500).json({
          success: false,
          error: result.error,
          message: result.message
        });
      }
    } catch (error) {
      logger.error("Error restoring from backup:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  static async getBackupStatistics(req, res) {
    try {
      const result = await PricingBackupService.getBackupStatistics();

      if (result.success) {
        res.json({
          success: true,
          data: result.statistics,
          message: result.message
        });
      } else {
        res.status(500).json({
          success: false,
          error: result.error,
          message: result.message
        });
      }
    } catch (error) {
      logger.error("Error getting backup statistics:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  static async enforceRetentionPolicy(req, res) {
    try {
      const { maxBackups, maxAgeDays, dryRun = false } = req.body;

      const result = await PricingBackupService.enforceRetentionPolicy({
        maxBackups: maxBackups ? parseInt(maxBackups) : undefined,
        maxAgeDays: maxAgeDays ? parseInt(maxAgeDays) : undefined,
        dryRun: dryRun === true || dryRun === "true",
      });

      res.json({
        success: true,
        message: dryRun
          ? "Dry run completed - no backups were deleted"
          : "Retention policy enforced successfully",
        result,
      });
    } catch (error) {
      logger.error("Error enforcing retention policy:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  static async deleteBackups(req, res) {
    try {
      const { changeDayIds } = req.body;
      const deletedBy = req.user?._id || req.body.deletedBy || "admin";

      if (!changeDayIds || !Array.isArray(changeDayIds) || changeDayIds.length === 0) {
        return res.status(400).json({
          success: false,
          error: "changeDayIds array is required",
        });
      }

      const result = await PricingBackupService.deleteBackups(changeDayIds, deletedBy);

      if (result.success) {
        res.json({
          success: true,
          message: result.message,
          data: {
            deletedCount: result.deletedCount,
            deletedBackups: result.deletedBackups,
            deletedBy: result.deletedBy
          }
        });
      } else {
        res.status(500).json({
          success: false,
          error: result.error,
          message: result.message
        });
      }
    } catch (error) {
      logger.error("Error deleting backups:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  static async getBackupSnapshot(req, res) {
    try {
      const { changeDayId } = req.params;
      const { preview = "true" } = req.query;

      logger.debug(`[BACKUP-SNAPSHOT] Fetching snapshot for: ${changeDayId}, preview: ${preview}`);

      const backup = await PricingBackup.findOne({ changeDayId }).exec();

      if (!backup) {
        return res.status(404).json({
          success: false,
          error: "Backup not found",
        });
      }

      // If preview mode, decompress and return the snapshot data
      if (preview === "true") {
        try {
          // Use the instance method to decompress
          const snapshot = backup.getSnapshot();

          logger.debug(`[BACKUP-SNAPSHOT] Decompressed snapshot for ${changeDayId}`);

          res.json({
            success: true,
            data: {
              changeDayId: backup.changeDayId,
              changeDay: backup.changeDay,
              preview: snapshot,
              fullSnapshotAvailable: true
            }
          });
        } catch (decompressError) {
          logger.error("[BACKUP-SNAPSHOT] Decompression error:", decompressError);
          res.status(500).json({
            success: false,
            error: "Failed to decompress backup snapshot",
            details: decompressError.message
          });
        }
      } else {
        // Return metadata only without decompressing
        res.json({
          success: true,
          data: {
            changeDayId: backup.changeDayId,
            changeDay: backup.changeDay,
            preview: null,
            fullSnapshotAvailable: true,
            snapshotMetadata: backup.snapshotMetadata
          }
        });
      }
    } catch (error) {
      logger.error("Error getting backup snapshot:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  static async getBackupSystemHealth(req, res) {
    try {
      const latestBackup = await PricingBackup.findOne({ isDeleted: { $ne: true } })
        .sort({ createdAt: -1 })
        .select("createdAt version isComplete")
        .lean()
        .exec();

      const totalBackups = await PricingBackup.countDocuments({ isDeleted: { $ne: true } });
      const completeBackups = await PricingBackup.countDocuments({
        isDeleted: { $ne: true },
        isComplete: true,
      });

      const lastAutoBackup = await PricingBackup.findOne({
        isDeleted: { $ne: true },
        isAutomatic: true,
      })
        .sort({ createdAt: -1 })
        .select("createdAt")
        .lean()
        .exec();

      const health = {
        status: "healthy",
        issues: [],
      };

      if (!latestBackup) {
        health.status = "warning";
        health.issues.push("No backups found");
      } else {
        const daysSinceBackup = (Date.now() - new Date(latestBackup.createdAt)) / (1000 * 60 * 60 * 24);
        if (daysSinceBackup > 7) {
          health.status = "warning";
          health.issues.push(`Last backup is ${Math.floor(daysSinceBackup)} days old`);
        }
      }

      if (completeBackups < totalBackups) {
        health.issues.push(`${totalBackups - completeBackups} incomplete backups found`);
      }

      res.json({
        success: true,
        health,
        metrics: {
          totalBackups,
          completeBackups,
          incompleteBackups: totalBackups - completeBackups,
          latestBackup: latestBackup
            ? {
                createdAt: latestBackup.createdAt,
                version: latestBackup.version,
              }
            : null,
          lastAutoBackup: lastAutoBackup?.createdAt || null,
        },
      });
    } catch (error) {
      logger.error("Error getting backup system health:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
}

export default PricingBackupController;
