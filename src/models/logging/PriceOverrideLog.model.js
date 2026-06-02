import mongoose from "mongoose";

const PriceOverrideLogSchema = new mongoose.Schema(
  {
    agreementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CustomerHeaderDoc',
      required: [true, 'Agreement ID is required']
    },

    versionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'VersionPdf',
      default: null
    },

    versionNumber: {
      type: Number,
      default: 1
    },

    salespersonId: {
      type: String,
      required: [true, 'Salesperson ID is required']
    },

    salespersonName: {
      type: String,
      required: [true, 'Salesperson name is required']
    },

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
        'insideSqFt', 'outsideSqFt', 'insideRate', 'outsideRate', 'sqFtFixedFee'
      ],
      required: [true, 'Field type is required']
    },

    originalValue: {
      type: Number,
      required: [true, 'Original value is required']
    },

    overrideValue: {
      type: Number,
      required: [true, 'Override value is required']
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

    isSignificantChange: {
      type: Boolean,
      default: false
    },

    requiresApproval: {
      type: Boolean,
      default: false
    },

    sessionId: {
      type: String,
      required: [true, 'Session ID is required']
    },

    documentTitle: {
      type: String,
      required: [true, 'Document title is required']
    },

    source: {
      type: String,
      enum: ['form_filling', 'edit_mode', 'version_update'],
      default: 'form_filling'
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

PriceOverrideLogSchema.index({ agreementId: 1, createdAt: -1 });
PriceOverrideLogSchema.index({ versionId: 1, createdAt: -1 });
PriceOverrideLogSchema.index({ salespersonId: 1, createdAt: -1 });
PriceOverrideLogSchema.index({ reviewStatus: 1 });
PriceOverrideLogSchema.index({ isSignificantChange: 1 });
PriceOverrideLogSchema.index({ requiresApproval: 1 });

PriceOverrideLogSchema.index({
  agreementId: 1,
  versionNumber: 1,
  createdAt: -1
});

PriceOverrideLogSchema.statics.getLogsForAgreement = async function(agreementId, options = {}) {
  const {
    versionNumber = null,
    salespersonId = null,
    reviewStatus = null,
    limit = 50,
    sortOrder = -1
  } = options;

  let query = {
    agreementId,
    isDeleted: { $ne: true }
  };

  if (versionNumber !== null) query.versionNumber = versionNumber;
  if (salespersonId) query.salespersonId = salespersonId;
  if (reviewStatus) query.reviewStatus = reviewStatus;

  return await this.find(query)
    .sort({ createdAt: sortOrder })
    .limit(limit)
    .lean();
};

PriceOverrideLogSchema.statics.getOverrideStats = async function(agreementId) {
  const stats = await this.aggregate([
    {
      $match: {
        agreementId: new mongoose.Types.ObjectId(agreementId),
        isDeleted: { $ne: true }
      }
    },
    {
      $group: {
        _id: null,
        totalOverrides: { $sum: 1 },
        avgChangePercentage: { $avg: '$changePercentage' },
        maxChangePercentage: { $max: '$changePercentage' },
        minChangePercentage: { $min: '$changePercentage' },
        significantChanges: {
          $sum: { $cond: ['$isSignificantChange', 1, 0] }
        },
        pendingApprovals: {
          $sum: { $cond: [{ $eq: ['$reviewStatus', 'pending'] }, 1, 0] }
        }
      }
    }
  ]);

  return stats.length > 0 ? stats[0] : {
    totalOverrides: 0,
    avgChangePercentage: 0,
    maxChangePercentage: 0,
    minChangePercentage: 0,
    significantChanges: 0,
    pendingApprovals: 0
  };
};

PriceOverrideLogSchema.methods.calculateSignificance = function() {
  const SIGNIFICANT_PERCENTAGE_THRESHOLD = 15;
  const SIGNIFICANT_AMOUNT_THRESHOLD = 50;

  const absChangePercentage = Math.abs(this.changePercentage);
  const absChangeAmount = Math.abs(this.changeAmount);

  this.isSignificantChange = (
    absChangePercentage >= SIGNIFICANT_PERCENTAGE_THRESHOLD ||
    absChangeAmount >= SIGNIFICANT_AMOUNT_THRESHOLD
  );

  this.requiresApproval = this.isSignificantChange;

  return this.isSignificantChange;
};

PriceOverrideLogSchema.pre('save', function(next) {
  if (this.isNew) {
    this.changeAmount = this.overrideValue - this.originalValue;
    this.changePercentage = this.originalValue !== 0
      ? ((this.changeAmount / this.originalValue) * 100)
      : 0;

    this.calculateSignificance();

    if (!this.requiresApproval) {
      this.reviewStatus = 'auto_approved';
    }
  }
  next();
});

export default mongoose.models.PriceOverrideLog
  || mongoose.model("PriceOverrideLog", PriceOverrideLogSchema);
