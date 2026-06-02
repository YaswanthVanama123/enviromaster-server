import { EmailTemplate } from "../../models/service/index.js";

export async function getActiveTemplate(req, res) {
  try {
    let template = await EmailTemplate.findOne({ isActive: true })
      .select('_id name subject body isActive updatedAt')
      .lean()
      .exec();

    if (!template) {
      const newTemplate = await EmailTemplate.create({
        name: 'default',
        subject: 'Document from EnviroMaster NVA',
        body: `Hello,

Please find the attached document.

Best regards,
EnviroMaster NVA Team`,
        isActive: true
      });
      console.log('📧 [EMAIL-TEMPLATE] Created default email template');

      template = {
        _id: newTemplate._id,
        name: newTemplate.name,
        subject: newTemplate.subject,
        body: newTemplate.body,
        isActive: newTemplate.isActive,
        updatedAt: newTemplate.updatedAt
      };
    }

    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    return res.json({
      success: true,
      template: {
        id: template._id,
        name: template.name,
        subject: template.subject,
        body: template.body,
        isActive: template.isActive,
        updatedAt: template.updatedAt
      }
    });
  } catch (error) {
    console.error('❌ [EMAIL-TEMPLATE] Error fetching active template:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch email template',
      detail: error.message
    });
  }
}

export async function updateTemplate(req, res) {
  try {
    const { subject, body } = req.body;

    if (!subject || !body) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        detail: 'subject and body are required'
      });
    }

    console.log('📧 [EMAIL-TEMPLATE] Updating email template');

    const template = await EmailTemplate.findOneAndUpdate(
      { isActive: true },
      {
        $set: {
          subject,
          body,
          updatedAt: new Date(),
          isActive: true
        },
        $setOnInsert: {
          name: 'default',
          createdAt: new Date()
        }
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
        select: '_id name subject body isActive updatedAt'
      }
    ).lean();

    console.log('✅ [EMAIL-TEMPLATE] Template updated successfully');

    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    return res.json({
      success: true,
      message: 'Email template updated successfully',
      template: {
        id: template._id,
        name: template.name,
        subject: template.subject,
        body: template.body,
        isActive: template.isActive,
        updatedAt: template.updatedAt
      }
    });
  } catch (error) {
    console.error('❌ [EMAIL-TEMPLATE] Error updating template:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update email template',
      detail: error.message
    });
  }
}

export async function testTemplate(req, res) {
  try {
    const template = await EmailTemplate.findOne({ isActive: true })
      .select('subject body updatedAt')
      .lean()
      .exec();

    return res.json({
      success: true,
      hasTemplate: !!template,
      template: template ? {
        subject: template.subject,
        body: template.body,
        updatedAt: template.updatedAt
      } : null
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
