import mongoose from 'mongoose';

const zohoMappingSchema = new mongoose.Schema({
  agreementId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'CustomerHeaderDoc',
    unique: true
  },

  zohoCompany: {
    id: {
      type: String,
      required: true,
      description: "Zoho Bigin Company record ID"
    },
    name: {
      type: String,
      required: true,
      description: "Company name for quick reference"
    },
    createdByUs: {
      type: Boolean,
      default: false,
      description: "True if we created this company, false if it existed"
    }
  },

  zohoDeal: {
    id: {
      type: String,
      required: true,
      description: "Zoho Bigin Pipeline (Deal) record ID"
    },
    name: {
      type: String,
      required: true,
      description: "Deal name for quick reference"
    },
    pipelineName: {
      type: String,
      required: true,
      description: "Pipeline name (e.g., 'Sales Pipeline')"
    },
    stage: {
      type: String,
      required: true,
      description: "Current deal stage (e.g., 'Proposal')"
    }
  },

  moduleName: {
    type: String,
    default: 'Pipelines',
    description: "Zoho module name (Pipelines, Contacts, etc.)"
  },

  lastUploadStatus: {
    type: String,
    enum: ['success', 'failed', 'partial'],
    default: 'success',
    description: "Status of the most recent upload attempt"
  },

  lastError: {
    type: String,
    default: null,
    description: "Details of the last error (if any)"
  },

  failedUploads: [{
    attemptedAt: {
      type: Date,
      default: Date.now
    },
    errorType: {
      type: String,
      enum: ['note_failed', 'file_failed', 'deal_creation_failed', 'api_error'],
      required: true
    },
    errorMessage: {
      type: String,
      required: true
    },
    zohoResponse: {
      type: mongoose.Schema.Types.Mixed,
      description: "Full Zoho API error response for debugging"
    }
  }],

  uploads: [{
    version: {
      type: Number,
      required: true,
      description: "Version number (1, 2, 3, etc.)"
    },
    zohoNoteId: {
      type: String,
      required: false,
      default: null,
      description: "Zoho Note record ID for this upload (null if note creation skipped)"
    },
    zohoFileId: {
      type: String,
      required: true,
      description: "Zoho File attachment ID"
    },
    noteText: {
      type: String,
      required: true,
      description: "Note content explaining changes/version"
    },
    fileName: {
      type: String,
      required: true,
      description: "PDF filename uploaded to Zoho"
    },
    uploadedAt: {
      type: Date,
      default: Date.now,
      description: "When this version was uploaded"
    },
    uploadedBy: {
      type: String,
      description: "User who performed the upload"
    }
  }],

  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },

  currentVersion: {
    type: Number,
    default: 1,
    description: "Latest version number"
  },
  lastUploadedAt: {
    type: Date,
    description: "When the most recent upload occurred"
  }
});

zohoMappingSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  if (this.uploads && this.uploads.length > 0) {
    this.lastUploadedAt = this.uploads[this.uploads.length - 1].uploadedAt;
    this.currentVersion = Math.max(...this.uploads.map(u => u.version));
  }
  next();
});

zohoMappingSchema.index({ agreementId: 1 }, { unique: true });
zohoMappingSchema.index({ 'zohoCompany.id': 1 });
zohoMappingSchema.index({ 'zohoDeal.id': 1 });
zohoMappingSchema.index({ createdAt: -1 });

zohoMappingSchema.methods.isFirstTimeUpload = function() {
  return !this.uploads || this.uploads.length === 0;
};

zohoMappingSchema.methods.getNextVersion = function() {
  return this.currentVersion + 1;
};

zohoMappingSchema.methods.addUpload = function(uploadData) {
  const version = this.getNextVersion();

  this.uploads.push({
    version,
    zohoNoteId: uploadData.zohoNoteId,
    zohoFileId: uploadData.zohoFileId,
    noteText: uploadData.noteText,
    fileName: uploadData.fileName,
    uploadedBy: uploadData.uploadedBy
  });

  return version;
};

zohoMappingSchema.statics.findByAgreementId = function(agreementId) {
  return this.findOne({ agreementId });
};

zohoMappingSchema.statics.findByZohoDealId = function(zohoDealId) {
  return this.findOne({ 'zohoDeal.id': zohoDealId });
};

zohoMappingSchema.statics.getUploadStats = function() {
  return this.aggregate([
    {
      $group: {
        _id: null,
        totalAgreements: { $sum: 1 },
        totalUploads: { $sum: { $size: '$uploads' } },
        avgUploadsPerAgreement: { $avg: { $size: '$uploads' } }
      }
    }
  ]);
};

const ZohoMapping = mongoose.model('ZohoMapping', zohoMappingSchema);

export default ZohoMapping;
