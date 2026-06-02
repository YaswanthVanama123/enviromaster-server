import mongoose from "mongoose";

const FieldChangeSchema = new mongoose.Schema({
  productKey: {
    type: String,
    required: [true, 'Product key is required']
  },

  productName: {
    type: String,
    required: [true, 'Product name is required']
  },

  productType: {
    type: String,
    enum: ['product', 'dispenser', 'service'],
    required: [true, 'Product type is required']
  },

  fieldType: {
    type: String,
    enum: [
      'unitPrice', 'amount', 'warrantyPrice', 'replacementPrice', 'total',
      'hourlyRate', 'minimumVisit', 'customPerVisitTotal', 'workers', 'hours', 'customAmount',
      'insideSqFt', 'outsideSqFt', 'insideRate', 'outsideRate', 'sqFtFixedFee',
      'customStandardBathroomTotal', 'customHugeBathroomTotal', 'customExtraAreaTotal',
      'customStandaloneTotal', 'customChemicalTotal', 'customPerVisitPrice',
      'customMonthlyRecurring', 'customFirstMonthPrice', 'customContractTotal'
    ],
    required: [true, 'Field type is required']
  },

  fieldDisplayName: {
    type: String,
    required: [true, 'Field display name is required']
  },

  originalValue: {
    type: Number,
    required: [true, 'Original value is required']
  },

  newValue: {
    type: Number,
    required: [true, 'New value is required']
  },

  changeAmount: {
    type: Number,
    required: [true, 'Change amount is required']
  },

  changePercentage: {
    type: Number,
    required: [true, 'Change percentage is required']
  },

  quantity: {
    type: Number,
    default: 0
  },

  frequency: {
    type: String,
    default: ''
  }
}, { _id: false });

const VersionChangeLogSchema = new mongoose.Schema(
  {
    agreementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CustomerHeaderDoc',
      required: [true, 'Agreement ID is required']
    },

    versionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'VersionPdf',
      required: [true, 'Version ID is required']
    },

    versionNumber: {
      type: Number,
      required: [true, 'Version number is required']
    },

    salespersonId: {
      type: String,
      required: [true, 'Salesperson ID is required']
    },

    salespersonName: {
      type: String,
      required: [true, 'Salesperson name is required']
    },

    changes: {
      type: [FieldChangeSchema],
      default: []
    },

    totalChanges: {
      type: Number,
      default: 0
    },

    totalPriceImpact: {
      type: Number,
      default: 0
    },

    hasSignificantChanges: {
      type: Boolean,
      default: false
    },

    saveAction: {
      type: String,
      enum: ['save_draft', 'generate_pdf', 'manual_save'],
      required: [true, 'Save action is required']
    },

    documentTitle: {
      type: String,
      required: [true, 'Document title is required']
    },

    sessionId: {
      type: String,
      required: [true, 'Session ID is required']
    },

    reviewStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'auto_approved'],
      default: 'pending'
    },

    reviewedBy: {
      type: String,
      default: null
    },

    reviewedAt: {
      type: Date,
      default: null
    },

    reviewNotes: {
      type: String,
      default: ''
    },

    ipAddress: {
      type: String,
      default: null
    },

    userAgent: {
      type: String,
      default: null
    },

    isDeleted: {
      type: Boolean,
      default: false
    },

    deletedAt: {
      type: Date,
      default: null
    },

    deletedBy: {
      type: String,
      default: null
    }
  },
  {
    timestamps: true,
    minimize: false
  }
);

VersionChangeLogSchema.pre('save', function(next) {
  if (this.changes && this.changes.length > 0) {
    this.totalChanges = this.changes.length;

    this.totalPriceImpact = this.changes.reduce((total, change) => {
      return total + Math.abs(change.changeAmount);
    }, 0);

    this.hasSignificantChanges = this.changes.some(change => {
      return Math.abs(change.changePercentage) > 15 || Math.abs(change.changeAmount) > 50;
    });

    if (!this.hasSignificantChanges && this.totalPriceImpact < 100) {
      this.reviewStatus = 'auto_approved';
    }
  }

  next();
});

VersionChangeLogSchema.index({ agreementId: 1, versionNumber: -1 });
VersionChangeLogSchema.index({ agreementId: 1, createdAt: -1 });
VersionChangeLogSchema.index({ versionId: 1 }, { unique: true });
VersionChangeLogSchema.index({ salespersonId: 1, createdAt: -1 });
VersionChangeLogSchema.index({ reviewStatus: 1 });
VersionChangeLogSchema.index({ hasSignificantChanges: 1 });
VersionChangeLogSchema.index({ saveAction: 1 });
VersionChangeLogSchema.index({ agreementId: 1, isDeleted: 1 });

VersionChangeLogSchema.index({
  agreementId: 1,
  versionNumber: -1,
  createdAt: -1
});

VersionChangeLogSchema.statics.getLogsForAgreement = function(agreementId, options = {}) {
  const filter = {
    agreementId: new mongoose.Types.ObjectId(agreementId),
    isDeleted: { $ne: true }
  };

  if (options.versionNumber) {
    filter.versionNumber = options.versionNumber;
  }

  if (options.salespersonId) {
    filter.salespersonId = options.salespersonId;
  }

  if (options.reviewStatus) {
    filter.reviewStatus = options.reviewStatus;
  }

  return this.find(filter)
    .sort({ versionNumber: -1, createdAt: -1 })
    .limit(options.limit || 50)
    .lean();
};

VersionChangeLogSchema.statics.getChangeStats = function(agreementId) {
  return this.aggregate([
    {
      $match: {
        agreementId: new mongoose.Types.ObjectId(agreementId),
        isDeleted: { $ne: true }
      }
    },
    {
      $group: {
        _id: null,
        totalVersions: { $sum: 1 },
        totalChanges: { $sum: '$totalChanges' },
        totalPriceImpact: { $sum: '$totalPriceImpact' },
        versionsWithSignificantChanges: {
          $sum: { $cond: ['$hasSignificantChanges', 1, 0] }
        },
        pendingApprovals: {
          $sum: { $cond: [{ $eq: ['$reviewStatus', 'pending'] }, 1, 0] }
        }
      }
    }
  ]);
};

const VersionChangeLog = mongoose.model("VersionChangeLog", VersionChangeLogSchema);

export default VersionChangeLog;
