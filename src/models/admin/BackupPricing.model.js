import mongoose from 'mongoose';
import zlib from 'zlib';

const BackupPricingSchema = new mongoose.Schema({
  changeDayId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },

  changeDay: {
    type: String,
    required: true,
    index: true
  },

  firstChangeTimestamp: {
    type: Date,
    required: true
  },

  compressedSnapshot: {
    type: Buffer,
    required: true
  },

  snapshotMetadata: {
    includedDataTypes: {
      priceFix: {
        type: Boolean,
        default: false
      },
      productCatalog: {
        type: Boolean,
        default: false
      },
      serviceConfigs: {
        type: Boolean,
        default: false
      }
    },

    documentCounts: {
      priceFixCount: {
        type: Number,
        default: 0
      },
      productCatalogCount: {
        type: Number,
        default: 0
      },
      serviceConfigCount: {
        type: Number,
        default: 0
      }
    },

    originalSize: {
      type: Number,
      required: true
    },
    compressedSize: {
      type: Number,
      required: true
    },
    compressionRatio: {
      type: Number,
      required: true
    }
  },

  backupTrigger: {
    type: String,
    enum: ['pricefix_update', 'product_catalog_update', 'service_config_update', 'manual', 'scheduled'],
    required: true
  },

  changedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AdminUser',
    required: false
  },

  changeContext: {
    changedAreas: [{
      type: String,
      enum: [
        'pricefix_services',
        'pricefix_tripcharge',
        'product_catalog_families',
        'product_catalog_products',
        'service_config_saniclean',
        'service_config_foamingdrain',
        'service_config_scrubservice',
        'service_config_handsanitizer',
        'service_config_micromaxfloor',
        'service_config_rpmwindow',
        'service_config_sanipod',
        'service_config_custom',
        'other'
      ]
    }],

    changeDescription: {
      type: String,
      maxlength: 500
    },

    changeCount: {
      type: Number,
      default: 1
    }
  },

  restorationInfo: {
    hasBeenRestored: {
      type: Boolean,
      default: false
    },
    lastRestoredAt: {
      type: Date
    },
    restoredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminUser'
    },
    restorationNotes: {
      type: String,
      maxlength: 1000
    }
  }
}, {
  timestamps: true,
  collection: 'backuppricing'
});

BackupPricingSchema.index({ changeDay: -1, createdAt: -1 });
BackupPricingSchema.index({ backupTrigger: 1, changeDay: -1 });
BackupPricingSchema.index({ changedBy: 1, changeDay: -1 });

BackupPricingSchema.statics.compressPricingData = function(pricingData) {
  try {
    const jsonString = JSON.stringify(pricingData);
    const compressed = zlib.gzipSync(jsonString);

    return {
      compressedData: compressed,
      originalSize: jsonString.length,
      compressedSize: compressed.length,
      compressionRatio: Math.round((compressed.length / jsonString.length) * 100) / 100
    };
  } catch (error) {
    throw new Error(`Compression failed: ${error.message}`);
  }
};

BackupPricingSchema.statics.decompressPricingData = function(compressedBuffer) {
  try {
    const decompressed = zlib.gunzipSync(compressedBuffer);
    return JSON.parse(decompressed.toString());
  } catch (error) {
    throw new Error(`Decompression failed: ${error.message}`);
  }
};

BackupPricingSchema.methods.getSnapshot = function() {
  return this.constructor.decompressPricingData(this.compressedSnapshot);
};

BackupPricingSchema.statics.getCurrentDateString = function() {
  return new Date().toISOString().split('T')[0];
};

BackupPricingSchema.statics.generateChangeDayId = function(changeDay) {
  return `backup_${changeDay}_${Date.now()}`;
};

BackupPricingSchema.statics.enforceRetentionPolicy = async function() {
  try {
    const changeDays = await this.distinct('changeDay');

    changeDays.sort().reverse();

    if (changeDays.length <= 10) {
      return { deletedCount: 0, message: 'Retention policy not needed' };
    }

    const changeDaysToDelete = changeDays.slice(10);

    if (changeDaysToDelete.length === 0) {
      return { deletedCount: 0, message: 'No old change days to delete' };
    }

    const deleteResult = await this.deleteMany({
      changeDay: { $in: changeDaysToDelete }
    });

    return {
      deletedCount: deleteResult.deletedCount,
      deletedChangeDays: changeDaysToDelete,
      message: `Deleted ${deleteResult.deletedCount} backups from ${changeDaysToDelete.length} old change days`
    };
  } catch (error) {
    throw new Error(`Retention policy enforcement failed: ${error.message}`);
  }
};

BackupPricingSchema.statics.hasBackupForToday = async function() {
  const today = this.getCurrentDateString();
  const existingBackup = await this.findOne({ changeDay: today });
  return !!existingBackup;
};

BackupPricingSchema.statics.getLastNChangeDays = async function(n = 10) {
  const startTime = Date.now();
  console.log(`[BACKUP-MODEL] Fetching last ${n} change days (optimized)...`);

  const result = await this.aggregate([
    { $sort: { changeDay: -1, createdAt: -1 } },

    {
      $group: {
        _id: '$changeDay',
        backups: { $push: '$$ROOT' }
      }
    },

    { $sort: { _id: -1 } },

    { $limit: n },

    { $unwind: '$backups' },

    {
      $project: {
        'backups.compressedSnapshot': 0
      }
    },

    { $replaceRoot: { newRoot: '$backups' } },

    { $sort: { changeDay: -1, createdAt: -1 } }
  ]);

  const queryTime = Date.now() - startTime;
  console.log(`[BACKUP-MODEL] Fetched ${result.length} backups in ${queryTime}ms (excluded compressedSnapshot)`);

  return result.map(backup => ({
    changeDay: backup.changeDay,
    backup: backup,
    backupCount: 1
  }));
};

BackupPricingSchema.pre('save', function(next) {
  const changeDayRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!changeDayRegex.test(this.changeDay)) {
    return next(new Error('changeDay must be in YYYY-MM-DD format'));
  }

  if (!this.changeDayId) {
    this.changeDayId = this.constructor.generateChangeDayId(this.changeDay);
  }

  next();
});

export default mongoose.model('BackupPricing', BackupPricingSchema);
