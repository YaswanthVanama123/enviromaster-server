import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from "../../utils/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const router = express.Router();

const LOGS_DIR = path.join(__dirname, '../../../logs/version-changes');

const ensureLogsDirectory = async () => {
  try {
    await fs.access(LOGS_DIR);
  } catch (error) {
    await fs.mkdir(LOGS_DIR, { recursive: true });
    logger.debug('Created logs directory:', LOGS_DIR);
  }
};

ensureLogsDirectory().catch(logger.error);

router.post('/create', async (req, res) => {
  try {
    const {
      agreementId,
      versionId,
      versionNumber,
      salespersonId,
      salespersonName,
      saveAction,
      documentTitle,
      changes
    } = req.body;

    logger.debug('[VERSION-LOGS] Creating log file:', {
      agreementId,
      versionNumber,
      changesCount: changes?.length || 0,
      saveAction
    });

    await ensureLogsDirectory();

    const fileName = `changes_v${versionNumber}_${agreementId}.txt`;
    const filePath = path.join(LOGS_DIR, fileName);

    const logContent = generateLogContent({
      agreementId,
      versionId,
      versionNumber,
      salespersonId,
      salespersonName,
      saveAction,
      documentTitle,
      changes: changes || []
    });

    await fs.writeFile(filePath, logContent, 'utf8');

    logger.debug('[VERSION-LOGS] Log file created successfully:', fileName);

    const totalChanges = changes?.length || 0;
    const totalPriceImpact = changes?.reduce((sum, change) => sum + (change.changeAmount || 0), 0) || 0;
    const hasSignificantChanges = changes?.some(change =>
      Math.abs(change.changeAmount || 0) >= 50 || Math.abs(change.changePercentage || 0) >= 15
    ) || false;

    res.status(200).json({
      success: true,
      message: 'Version log file created successfully',
      logFile: {
        fileName,
        filePath,
        agreementId,
        versionId,
        versionNumber,
        totalChanges,
        totalPriceImpact: parseFloat(totalPriceImpact.toFixed(2)),
        hasSignificantChanges,
        saveAction,
        createdAt: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('[VERSION-LOGS] Error creating log file:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create version log file',
      error: error.message
    });
  }
});

router.get('/:agreementId', async (req, res) => {
  try {
    const { agreementId } = req.params;

    const files = await fs.readdir(LOGS_DIR);

    const agreementLogFiles = files
      .filter(file => file.includes(`_${agreementId}.txt`))
      .map(file => {
        const match = file.match(/changes_v(\d+)_(.+)\.txt/);
        return {
          fileName: file,
          versionNumber: match ? parseInt(match[1]) : 0,
          agreementId: match ? match[2] : agreementId,
          filePath: path.join(LOGS_DIR, file)
        };
      })
      .sort((a, b) => a.versionNumber - b.versionNumber);

    res.status(200).json({
      success: true,
      agreementId,
      logFiles: agreementLogFiles
    });

  } catch (error) {
    logger.error('[VERSION-LOGS] Error getting log files:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get log files',
      error: error.message
    });
  }
});

router.get('/download/:fileName', async (req, res) => {
  try {
    const { fileName } = req.params;
    const filePath = path.join(LOGS_DIR, fileName);

    await fs.access(filePath);

    const content = await fs.readFile(filePath, 'utf8');

    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.status(200).send(content);

  } catch (error) {
    logger.error('[VERSION-LOGS] Error downloading log file:', error);
    res.status(404).json({
      success: false,
      message: 'Log file not found',
      error: error.message
    });
  }
});

function generateLogContent({
  agreementId,
  versionId,
  versionNumber,
  salespersonId,
  salespersonName,
  saveAction,
  documentTitle,
  changes
}) {
  const timestamp = new Date().toISOString();
  const date = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  let content = '';
  content += '='.repeat(80) + '\n';
  content += '                    VERSION CHANGE LOG\n';
  content += '='.repeat(80) + '\n\n';

  content += `Document Title: ${documentTitle || 'Untitled Document'}\n`;
  content += `Agreement ID: ${agreementId}\n`;
  content += `Version ID: ${versionId}\n`;
  content += `Version Number: v${versionNumber}\n`;
  content += `Save Action: ${saveAction.toUpperCase().replace('_', ' ')}\n`;
  content += `Timestamp: ${date}\n`;
  content += `Salesperson: ${salespersonName} (${salespersonId})\n\n`;

  const totalChanges = changes.length;
  const totalPriceImpact = changes.reduce((sum, change) => sum + (change.changeAmount || 0), 0);
  const significantChanges = changes.filter(change =>
    Math.abs(change.changeAmount || 0) >= 50 || Math.abs(change.changePercentage || 0) >= 15
  );

  content += '-'.repeat(80) + '\n';
  content += '                        SUMMARY\n';
  content += '-'.repeat(80) + '\n';
  content += `Total Changes Made: ${totalChanges}\n`;
  content += `Total Price Impact: $${totalPriceImpact.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}\n`;
  content += `Significant Changes: ${significantChanges.length} (>=\$50 or >=15%)\n`;
  content += `Review Status: ${significantChanges.length > 0 ? 'REQUIRES REVIEW' : 'AUTO-APPROVED'}\n\n`;

  if (changes.length === 0) {
    content += '-'.repeat(80) + '\n';
    content += '                     NO CHANGES DETECTED\n';
    content += '-'.repeat(80) + '\n';
    content += 'No price overrides or modifications were made during this save.\n\n';
  } else {
    content += '-'.repeat(80) + '\n';
    content += '                    DETAILED CHANGES\n';
    content += '-'.repeat(80) + '\n\n';

    const changesByProduct = {};
    changes.forEach(change => {
      if (!changesByProduct[change.productName]) {
        changesByProduct[change.productName] = [];
      }
      changesByProduct[change.productName].push(change);
    });

    let changeIndex = 1;
    Object.keys(changesByProduct).forEach(productName => {
      const productChanges = changesByProduct[productName];

      content += `${changeIndex}. ${productName}\n`;
      content += `   Type: ${productChanges[0].productType.toUpperCase()}\n`;
      if (productChanges[0].quantity) {
        content += `   Quantity: ${productChanges[0].quantity}\n`;
      }
      if (productChanges[0].frequency) {
        content += `   Frequency: ${productChanges[0].frequency}\n`;
      }
      content += '\n';

      productChanges.forEach(change => {
        const isSignificant = Math.abs(change.changeAmount || 0) >= 50 || Math.abs(change.changePercentage || 0) >= 15;
        const indicator = isSignificant ? 'SIGNIFICANT' : 'Minor';

        content += `   • ${change.fieldDisplayName}:\n`;
        content += `     Original: $${(change.originalValue || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}\n`;
        content += `     New: $${(change.newValue || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}\n`;
        content += `     Change: ${change.changeAmount >= 0 ? '+' : ''}$${(change.changeAmount || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})} `;
        content += `(${change.changeAmount >= 0 ? '+' : ''}${(change.changePercentage || 0).toFixed(1)}%) ${indicator}\n\n`;
      });

      changeIndex++;
    });

    if (significantChanges.length > 0) {
      content += '-'.repeat(80) + '\n';
      content += '                  WARNING: SIGNIFICANT CHANGES DETECTED\n';
      content += '-'.repeat(80) + '\n';
      content += 'The following changes exceed the significance threshold (>=\$50 or >=15%):\n\n';

      significantChanges.forEach((change, index) => {
        content += `${index + 1}. ${change.productName} - ${change.fieldDisplayName}\n`;
        content += `   Change: ${change.changeAmount >= 0 ? '+' : ''}$${(change.changeAmount || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})} `;
        content += `(${change.changeAmount >= 0 ? '+' : ''}${(change.changePercentage || 0).toFixed(1)}%)\n\n`;
      });

      content += 'These changes may require manager approval before finalizing.\n\n';
    }
  }

  content += '='.repeat(80) + '\n';
  content += '                      END OF LOG\n';
  content += '='.repeat(80) + '\n';
  content += `Generated on: ${timestamp}\n`;
  content += 'This log file contains a complete record of all pricing changes made during form editing.\n';

  return content;
}

export default router;
