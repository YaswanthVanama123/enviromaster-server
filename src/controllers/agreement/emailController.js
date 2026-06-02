import { sendEmail as sendEmailService, verifyEmailConfig } from '../../services/emailService.js';
import { CustomerHeaderDoc, VersionPdf, ManualUploadDocument } from "../../models/agreement/index.js";
import { Log } from "../../models/logging/index.js";
import { compileCustomerHeader } from '../../services/pdfService.js';

export async function sendEmailWithPdf(req, res) {
  try {
    const { to, subject, body, documentId, documentType, watermark = false, waitForSend = false } = req.body;

    console.log('⚡ [EMAIL-CONTROLLER] Received email request:', {
      to,
      subject,
      documentId,
      documentType: documentType || 'auto-detect',
      watermark,
      waitForSend,
      mode: waitForSend ? 'NORMAL (wait for send)' : 'ULTRA-FAST (immediate response)'
    });

    if (!to || !subject || !documentId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        detail: 'to, subject, and documentId are required'
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid recipient email address'
      });
    }

    const normalizedType = String(documentType || 'agreement').toLowerCase();
    const typeVariants = [
      { category: "version", keys: ["version", "version_pdf"] },
      { category: "log", keys: ["version-log", "version_log", "log", "change-log"] },
      { category: "manual", keys: ["manual-upload", "manual_upload", "manualupload", "attached-file", "attached_file", "attached", "attached_pdf"] },
      { category: "agreement", keys: ["agreement", "main_pdf", "main-pdf"] },
    ];
    const resolveCategory = (candidate) => {
      for (const variant of typeVariants) {
        if (variant.keys.includes(candidate)) return variant.category;
      }
      return null;
    };
    const requestedCategory = resolveCategory(normalizedType) || "agreement";

    console.log('🔍 [EMAIL-CONTROLLER] Resolved document type:', normalizedType, '→ category:', requestedCategory);

    const loadPdfAsync = async () => {
      let pdfBuffer;
      let fileName;
      let attachmentContentType = "application/pdf";

      if (requestedCategory === 'version') {
        const version = await VersionPdf.findById(documentId)
          .select('_id versionNumber versionLabel fileName payloadSnapshot')
          .lean();

        let skipVersionCompile = false;
        if (!version) {
          console.log(`🔍 [EMAIL-CONTROLLER] Version not found, trying fallback lookups...`);

          const manualUpload = await ManualUploadDocument.findById(documentId)
            .select('pdfBuffer fileName mimeType')
            .lean();

          if (manualUpload?.pdfBuffer) {
            pdfBuffer = manualUpload.pdfBuffer.buffer
              ? Buffer.from(manualUpload.pdfBuffer.buffer)
              : Buffer.isBuffer(manualUpload.pdfBuffer)
                ? manualUpload.pdfBuffer
                : Buffer.from(manualUpload.pdfBuffer);

            fileName = manualUpload.fileName;
            attachmentContentType = manualUpload.mimeType || "application/pdf";
            skipVersionCompile = true;
            console.log(`✅ [EMAIL-CONTROLLER] Found as manual upload (${pdfBuffer.length} bytes)`);
          } else {
            const logDoc = await Log.findById(documentId);
            if (logDoc) {
              const logContent = logDoc.generateTextContent();
              pdfBuffer = Buffer.from(logContent || '', 'utf8');
              fileName = logDoc.fileName || `Version_${logDoc.versionNumber}_Changes.txt`;
              attachmentContentType = logDoc.contentType || 'text/plain; charset=utf-8';
              skipVersionCompile = true;
              console.log(`✅ [EMAIL-CONTROLLER] Found as log file`);
            } else {
              throw new Error(`Version not found with ID: ${documentId}`);
            }
          }
        }

        if (!skipVersionCompile) {
          console.log(`📄 [EMAIL-CONTROLLER] Compiling version PDF: ${version.versionLabel}`);
          const compiledPdf = await compileCustomerHeader(version.payloadSnapshot, { watermark });
          if (!compiledPdf?.buffer) {
            throw new Error('Failed to compile version PDF');
          }
          pdfBuffer = compiledPdf.buffer;
          fileName = watermark
            ? version.fileName.replace('.pdf', '_DRAFT.pdf')
            : version.fileName;
        }

      } else if (requestedCategory === 'manual') {
        const manualUpload = await ManualUploadDocument.findById(documentId)
          .select('pdfBuffer fileName mimeType')
          .lean();

        if (!manualUpload) {
          throw new Error(`Manual upload file not found with ID: ${documentId}`);
        }

        if (!manualUpload.pdfBuffer) {
          throw new Error('File buffer not found');
        }

        pdfBuffer = manualUpload.pdfBuffer.buffer
          ? Buffer.from(manualUpload.pdfBuffer.buffer)
          : Buffer.isBuffer(manualUpload.pdfBuffer)
            ? manualUpload.pdfBuffer
            : Buffer.from(manualUpload.pdfBuffer);

        fileName = manualUpload.fileName;
        attachmentContentType = manualUpload.mimeType || "application/pdf";
        console.log(`📄 [EMAIL-CONTROLLER] Loaded manual upload: ${fileName} (${pdfBuffer.length} bytes)`);

      } else if (requestedCategory === 'log') {
        const logDoc = await Log.findById(documentId);
        if (!logDoc) {
          throw new Error(`Version log not found with ID: ${documentId}`);
        }

        const logContent = logDoc.generateTextContent();
        pdfBuffer = Buffer.from(logContent || '', 'utf8');
        fileName = logDoc.fileName || `Version_${logDoc.versionNumber}_Changes.txt`;
        attachmentContentType = logDoc.contentType || 'text/plain; charset=utf-8';
        console.log(`📄 [EMAIL-CONTROLLER] Loaded log file: ${fileName} (${pdfBuffer.length} bytes)`);

      } else if (requestedCategory === 'agreement') {
        const agreement = await CustomerHeaderDoc.findById(documentId)
          .select('_id payload.headerTitle pdf_meta.pdfBuffer')
          .lean();

        if (!agreement) {
          if (!documentType) {
            const version = await VersionPdf.findById(documentId)
              .select('_id versionNumber versionLabel fileName payloadSnapshot')
              .lean();

            if (version) {
              console.log(`📄 [EMAIL-CONTROLLER] Auto-detected as version PDF`);
              const compiledPdf = await compileCustomerHeader(version.payloadSnapshot, { watermark });
              if (!compiledPdf?.buffer) {
                throw new Error('Failed to compile version PDF');
              }
              pdfBuffer = compiledPdf.buffer;
              fileName = watermark
                ? version.fileName.replace('.pdf', '_DRAFT.pdf')
                : version.fileName;
            } else {
              throw new Error(`Document not found with ID: ${documentId}`);
            }
          } else {
            throw new Error(`Agreement not found with ID: ${documentId}`);
          }
        } else {
          if (!agreement.pdf_meta?.pdfBuffer) {
            throw new Error('PDF not available. Please generate it first.');
          }

          const rawBuffer = agreement.pdf_meta.pdfBuffer;
          pdfBuffer = rawBuffer.buffer
            ? Buffer.from(rawBuffer.buffer)
            : Buffer.isBuffer(rawBuffer)
              ? rawBuffer
              : Buffer.from(rawBuffer);

          fileName = `${agreement.payload?.headerTitle || 'Agreement'}.pdf`;
          console.log(`📄 [EMAIL-CONTROLLER] Loaded agreement PDF: ${fileName} (${pdfBuffer.length} bytes)`);
        }
      } else {
        throw new Error('Invalid document type');
      }

      if (!pdfBuffer) {
        throw new Error('File buffer missing');
      }

      console.log('📎 [EMAIL-CONTROLLER] PDF ready:', {
        fileName,
        size: `${(pdfBuffer.length / 1024 / 1024).toFixed(2)} MB`
      });

      return { pdfBuffer, fileName, attachmentContentType };
    };

    if (!waitForSend) {
      console.log('🚀 [EMAIL-CONTROLLER] ULTRA-FAST MODE: Queuing email, returning immediately');

      loadPdfAsync()
        .then(async ({ pdfBuffer, fileName, attachmentContentType }) => {
          const emailResult = await sendEmailService({
            to,
            from: process.env.EMAIL_FROM_ADDRESS || 'noreply@enviromasternva.com',
            subject,
            body: body || `Please find the attached document: ${fileName}`,
            attachment: {
              buffer: pdfBuffer,
              filename: fileName,
              contentType: attachmentContentType
            },
            fireAndForget: false
          });

          if (emailResult.success) {
            console.log('✅ [EMAIL-CONTROLLER] Background email sent:', fileName);
          } else {
            console.error('❌ [EMAIL-CONTROLLER] Background email failed:', emailResult.error);
          }
        })
        .catch(error => {
          console.error('❌ [EMAIL-CONTROLLER] Background processing error:', error.message);
        });

      return res.json({
        success: true,
        message: 'Email queued for sending',
        queued: true,
        documentId,
        estimatedSendTime: '5-10 seconds'
      });
    }

    console.log('⏳ [EMAIL-CONTROLLER] NORMAL MODE: Waiting for completion...');
    const { pdfBuffer, fileName, attachmentContentType } = await loadPdfAsync();

    const emailResult = await sendEmailService({
      to,
      from: process.env.EMAIL_FROM_ADDRESS || 'noreply@enviromasternva.com',
      subject,
      body: body || `Please find the attached document: ${fileName}`,
      attachment: {
        buffer: pdfBuffer,
        filename: fileName,
        contentType: attachmentContentType
      },
      fireAndForget: false
    });

    if (emailResult.success) {
      console.log('✅ [EMAIL-CONTROLLER] Email sent successfully');
      return res.json({
        success: true,
        message: 'Email sent successfully',
        messageId: emailResult.messageId,
        fileName
      });
    } else {
      console.error('❌ [EMAIL-CONTROLLER] Failed to send email:', emailResult.error);
      return res.status(500).json({
        success: false,
        error: 'Failed to send email',
        detail: emailResult.error
      });
    }

  } catch (error) {
    console.error('❌ [EMAIL-CONTROLLER] Error in sendEmailWithPdf:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      detail: error.message
    });
  }
}

export async function verifyEmailConfiguration(req, res) {
  try {
    const result = await verifyEmailConfig();

    if (result.success) {
      return res.json(result);
    } else {
      return res.status(500).json(result);
    }

  } catch (error) {
    console.error('❌ [EMAIL-CONTROLLER] Error verifying email config:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to verify email configuration',
      detail: error.message
    });
  }
}

export async function sendTestEmail(req, res) {
  try {
    const { to } = req.body;

    if (!to) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: to'
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email address'
      });
    }

    const result = await sendEmailService({
      to,
      subject: 'Test Email from EnviroMaster System',
      body: `
        <h2>Test Email</h2>
        <p>This is a test email from the EnviroMaster email system.</p>
        <p>If you received this email, your email configuration is working correctly!</p>
        <br>
        <p style="color: #666; font-size: 12px;">
          Sent at: ${new Date().toLocaleString()}<br>
          From: EnviroMaster Email System
        </p>
      `
    });

    if (result.success) {
      return res.json({
        success: true,
        message: 'Test email sent successfully',
        messageId: result.messageId
      });
    } else {
      return res.status(500).json(result);
    }

  } catch (error) {
    console.error('❌ [EMAIL-CONTROLLER] Error sending test email:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to send test email',
      detail: error.message
    });
  }
}
