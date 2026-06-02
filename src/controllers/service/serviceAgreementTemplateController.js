import { ServiceAgreementTemplate } from "../../models/service/index.js";

export async function getActiveTemplate(req, res) {
  try {
    let template = await ServiceAgreementTemplate.findOne({ isActive: true })
      .select('-__v')
      .lean()
      .exec();

    if (!template) {
      const newTemplate = await ServiceAgreementTemplate.create({
        name: 'default',
        isActive: true
      });
      console.log('📝 [SERVICE-AGREEMENT-TEMPLATE] Created default template');

      template = newTemplate.toObject();
    }

    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    return res.json({
      success: true,
      template: {
        id: template._id,
        name: template.name,
        term1: template.term1,
        term2: template.term2,
        term3: template.term3,
        term4: template.term4,
        term5: template.term5,
        term6: template.term6,
        term7: template.term7,
        noteText: template.noteText,
        titleText: template.titleText,
        subtitleText: template.subtitleText,
        retainDispensersLabel: template.retainDispensersLabel,
        disposeDispensersLabel: template.disposeDispensersLabel,
        emSalesRepLabel: template.emSalesRepLabel,
        insideSalesRepLabel: template.insideSalesRepLabel,
        authorityText: template.authorityText,
        customerContactLabel: template.customerContactLabel,
        customerSignatureLabel: template.customerSignatureLabel,
        customerDateLabel: template.customerDateLabel,
        emFranchiseeLabel: template.emFranchiseeLabel,
        emSignatureLabel: template.emSignatureLabel,
        emDateLabel: template.emDateLabel,
        pageNumberText: template.pageNumberText,
        isActive: template.isActive,
        updatedAt: template.updatedAt
      }
    });
  } catch (error) {
    console.error('❌ [SERVICE-AGREEMENT-TEMPLATE] Error fetching active template:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch service agreement template',
      detail: error.message
    });
  }
}

export async function updateTemplate(req, res) {
  try {
    const {
      term1, term2, term3, term4, term5, term6, term7,
      noteText,
      titleText, subtitleText,
      retainDispensersLabel, disposeDispensersLabel,
      emSalesRepLabel, insideSalesRepLabel,
      authorityText,
      customerContactLabel, customerSignatureLabel, customerDateLabel,
      emFranchiseeLabel, emSignatureLabel, emDateLabel,
      pageNumberText
    } = req.body;

    console.log('📝 [SERVICE-AGREEMENT-TEMPLATE] Updating service agreement template');

    const updateData = {
      updatedAt: new Date(),
      isActive: true
    };

    if (term1 !== undefined) updateData.term1 = term1;
    if (term2 !== undefined) updateData.term2 = term2;
    if (term3 !== undefined) updateData.term3 = term3;
    if (term4 !== undefined) updateData.term4 = term4;
    if (term5 !== undefined) updateData.term5 = term5;
    if (term6 !== undefined) updateData.term6 = term6;
    if (term7 !== undefined) updateData.term7 = term7;
    if (noteText !== undefined) updateData.noteText = noteText;
    if (titleText !== undefined) updateData.titleText = titleText;
    if (subtitleText !== undefined) updateData.subtitleText = subtitleText;
    if (retainDispensersLabel !== undefined) updateData.retainDispensersLabel = retainDispensersLabel;
    if (disposeDispensersLabel !== undefined) updateData.disposeDispensersLabel = disposeDispensersLabel;
    if (emSalesRepLabel !== undefined) updateData.emSalesRepLabel = emSalesRepLabel;
    if (insideSalesRepLabel !== undefined) updateData.insideSalesRepLabel = insideSalesRepLabel;
    if (authorityText !== undefined) updateData.authorityText = authorityText;
    if (customerContactLabel !== undefined) updateData.customerContactLabel = customerContactLabel;
    if (customerSignatureLabel !== undefined) updateData.customerSignatureLabel = customerSignatureLabel;
    if (customerDateLabel !== undefined) updateData.customerDateLabel = customerDateLabel;
    if (emFranchiseeLabel !== undefined) updateData.emFranchiseeLabel = emFranchiseeLabel;
    if (emSignatureLabel !== undefined) updateData.emSignatureLabel = emSignatureLabel;
    if (emDateLabel !== undefined) updateData.emDateLabel = emDateLabel;
    if (pageNumberText !== undefined) updateData.pageNumberText = pageNumberText;

    const template = await ServiceAgreementTemplate.findOneAndUpdate(
      { isActive: true },
      {
        $set: updateData,
        $setOnInsert: {
          name: 'default',
          createdAt: new Date()
        }
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
        select: '-__v'
      }
    ).lean();

    console.log('✅ [SERVICE-AGREEMENT-TEMPLATE] Template updated successfully');

    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    return res.json({
      success: true,
      message: 'Service agreement template updated successfully',
      template: {
        id: template._id,
        name: template.name,
        term1: template.term1,
        term2: template.term2,
        term3: template.term3,
        term4: template.term4,
        term5: template.term5,
        term6: template.term6,
        term7: template.term7,
        noteText: template.noteText,
        titleText: template.titleText,
        subtitleText: template.subtitleText,
        retainDispensersLabel: template.retainDispensersLabel,
        disposeDispensersLabel: template.disposeDispensersLabel,
        emSalesRepLabel: template.emSalesRepLabel,
        insideSalesRepLabel: template.insideSalesRepLabel,
        authorityText: template.authorityText,
        customerContactLabel: template.customerContactLabel,
        customerSignatureLabel: template.customerSignatureLabel,
        customerDateLabel: template.customerDateLabel,
        emFranchiseeLabel: template.emFranchiseeLabel,
        emSignatureLabel: template.emSignatureLabel,
        emDateLabel: template.emDateLabel,
        pageNumberText: template.pageNumberText,
        isActive: template.isActive,
        updatedAt: template.updatedAt
      }
    });
  } catch (error) {
    console.error('❌ [SERVICE-AGREEMENT-TEMPLATE] Error updating template:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update service agreement template',
      detail: error.message
    });
  }
}
