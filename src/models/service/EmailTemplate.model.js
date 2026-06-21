import mongoose from 'mongoose';

const emailTemplateSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    default: 'default'
  },
  subject: {
    type: String,
    required: true,
    default: 'Document from EnviroMaster NVA'
  },
  body: {
    type: String,
    required: true,
    default: `Hello,

Please find the attached document.

Best regards,
EnviroMaster NVA Team`
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

emailTemplateSchema.index({ isActive: 1 });

emailTemplateSchema.pre('save', async function(next) {
  if (this.isActive && this.isModified('isActive')) {
    await mongoose.model('EmailTemplate').updateMany(
      { _id: { $ne: this._id }, isActive: true },
      { isActive: false }
    );
  }
  next();
});

const EmailTemplate = mongoose.model('EmailTemplate', emailTemplateSchema);

export default EmailTemplate;
