/**
 * Zoho Upload Operations Controller
 * Handles first-time upload, update upload, and batch operations
 */

import mongoose from "mongoose";
import { ZohoMapping } from "../../models/sync/index.js";
import { CustomerHeaderDoc, ManualUploadDocument, VersionPdf } from "../../models/agreement/index.js";
import { recalcCommissionForAgreement, recalcCommissionForAgreementById } from "../../services/commissionAutomation.js";
import { compileCustomerHeader } from "../../services/pdfService.js";
import {
  createBiginDeal,
  createBiginNote,
  uploadBiginFile,
  validatePipelineStage,
  getOrCreateContactForDeal,
} from "../../services/zohoService.js";
import {
  buildNormalizedFileName,
  calculateDealAmount,
} from "../../services/zohoUploadService.js";

/**
 * First-time upload to Zoho Bigin
 */
export async function firstTimeUpload(req, res) {
  try {
    const { agreementId } = req.params;
    const {
      companyId,
      companyName,
      pipelineName = "Sales Pipeline",
      stage = "Proposal",
      noteText,
      dealName,
      skipFileUpload = false,
    } = req.body;

    console.log(`🚀 Starting first-time upload for agreement: ${agreementId}`);

    if (!mongoose.Types.ObjectId.isValid(agreementId)) {
      console.error(`❌ Invalid ObjectId format: ${agreementId}`);
      return res.status(400).json({
        success: false,
        error: "Invalid agreement ID format",
      });
    }

    if (!companyId || !noteText || !dealName) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: companyId, dealName, and noteText",
      });
    }

    console.log(`🔍 Validating pipeline and stage values...`);
    const validationResult = await validatePipelineStage(pipelineName, stage);

    let validatedPipeline = pipelineName;
    let validatedStage = stage;

    if (validationResult.success && validationResult.valid) {
      validatedPipeline = validationResult.correctedPipeline;
      validatedStage = validationResult.correctedStage;
      console.log(`✅ Pipeline/stage validation successful: "${validatedPipeline}" / "${validatedStage}"`);
    } else {
      console.warn(`⚠️ Pipeline/stage validation failed, using fallback values:`, validationResult.error);
      validatedPipeline = validationResult.correctedPipeline || "Sales Pipeline";
      validatedStage = validationResult.correctedStage || "Proposal/Price Quote";
      console.log(`🔧 Using validated fallback: "${validatedPipeline}" / "${validatedStage}"`);
    }

    console.log(`🔍 Looking up CustomerHeaderDoc with ID: ${agreementId}`);
    const agreement = await CustomerHeaderDoc.findById(agreementId);

    if (!agreement) {
      console.error(`❌ CustomerHeaderDoc not found with ID: ${agreementId}`);
      return res.status(404).json({
        success: false,
        error: "Agreement not found",
        details: `CustomerHeaderDoc with ID ${agreementId} does not exist in database`,
      });
    }

    console.log(`✅ Found CustomerHeaderDoc: ${agreement._id} (${agreement.payload?.headerTitle || "No title"})`);

    // Get version document for PDF compilation
    let versionDoc = await VersionPdf.findOne({
      agreementId: agreementId,
      status: { $ne: "archived" },
    })
      .sort({ versionNumber: -1 })
      .select("_id versionNumber payloadSnapshot fileName");

    let payloadForCompilation;
    let versionNumber;
    let fileName;

    if (versionDoc && versionDoc.payloadSnapshot) {
      payloadForCompilation = versionDoc.payloadSnapshot;
      versionNumber = versionDoc.versionNumber;
      fileName = versionDoc.fileName;
      console.log(`📄 [ZOHO-FIRST-TIME] Using VersionPdf v${versionNumber} payloadSnapshot`);
    } else {
      payloadForCompilation = agreement.payload;
      versionNumber = agreement.currentVersionNumber || 1;
      fileName = agreement.fileName;
      console.log(`📄 [ZOHO-FIRST-TIME] Using CustomerHeaderDoc payload (no version found)`);
    }

    if (!payloadForCompilation) {
      console.error(`❌ Agreement ${agreementId} has no payload for PDF compilation`);
      return res.status(400).json({
        success: false,
        error: "Agreement has no payload data for PDF compilation",
      });
    }

    console.log(`🔄 [ZOHO-FIRST-TIME] Recompiling PDF on-demand for version ${versionNumber}...`);

    const compiledPdf = await compileCustomerHeader(payloadForCompilation, { watermark: false });

    if (!compiledPdf || !compiledPdf.buffer) {
      console.error(`❌ Failed to compile PDF for version ${versionNumber}`);
      return res.status(500).json({
        success: false,
        error: "Failed to compile PDF for upload",
      });
    }

    console.log(`✅ [ZOHO-FIRST-TIME] PDF compiled successfully: ${compiledPdf.buffer.length} bytes`);

    const pdfData = {
      pdfBuffer: compiledPdf.buffer,
      source: "On-Demand Compilation",
      version: versionNumber,
      versionId: versionDoc?._id || null,
      fileName: fileName || `agreement_v${versionNumber}.pdf`,
      sizeBytes: compiledPdf.buffer.length,
      bufferSize: compiledPdf.buffer.length,
    };

    // Check for existing mapping
    const existingMapping = await ZohoMapping.findByAgreementId(agreementId);

    if (existingMapping && existingMapping.lastUploadStatus === "failed") {
      console.log(`🔄 [V2-CLEAN-RETRY] Found failed mapping - deleting to allow fresh retry`);
      await ZohoMapping.findByIdAndDelete(existingMapping._id);
      console.log(`✅ [V2-CLEAN-RETRY] Cleaned up failed mapping ${existingMapping._id}`);
    } else if (existingMapping) {
      return res.status(400).json({
        success: false,
        error: "This agreement has already been uploaded to Zoho. Use the update endpoint instead.",
      });
    }

    const dealAmount = calculateDealAmount(agreement);
    console.log(`💼 Creating deal with amount: $${dealAmount}`);

    // Get or create contact
    let contactId = null;
    try {
      console.log(`👤 [CONTACT-LOOKUP] Resolving contact for company: ${companyId}`);
      const contactResult = await getOrCreateContactForDeal(companyId, companyName || "Company");

      if (contactResult.success && contactResult.contact) {
        contactId = contactResult.contact.id;
        console.log(`✅ [CONTACT-LOOKUP] Found/created contact: ${contactResult.contact.name} (${contactId})`);
      }
    } catch (contactError) {
      console.error(`❌ [CONTACT-LOOKUP] Exception: ${contactError.message}`);
    }

    // Create deal
    const dealResult = await createBiginDeal({
      dealName: dealName.trim(),
      companyId,
      contactId,
      subPipelineName: validatedPipeline,
      stage: validatedStage,
      amount: dealAmount,
      closingDate: new Date().toISOString().split("T")[0],
      description: `EnviroMaster service agreement - ${agreement.payload?.headerTitle || "Service Proposal"}`,
    });

    if (!dealResult.success) {
      console.error(`❌ Deal creation failed:`, dealResult.error);
      return res.status(500).json({
        success: false,
        error: `Failed to create deal: ${dealResult.error?.message || "Unknown error"}`,
        details: dealResult.error,
        retryable: true,
        suggestion: "Please try again - no partial data was saved",
      });
    }

    const deal = dealResult.deal;
    console.log(`✅ Deal created: ${deal.id}`);

    // Create note
    const noteResult = await createBiginNote(deal.id, {
      title: `Agreement v1 - ${new Date().toLocaleDateString()}`,
      content: noteText.trim(),
    });

    if (!noteResult.success) {
      console.error(`❌ Failed to create note, but deal exists: ${deal.id}`);
      return res.status(500).json({
        success: false,
        error: `Deal created but failed to create note: ${noteResult.error?.message}`,
        dealId: deal.id,
        retryable: true,
        suggestion: "Deal was created in Zoho. You can try uploading again.",
        zohoStatus: "deal_created_note_failed",
      });
    }

    const note = noteResult.note;
    console.log(`✅ Note created: ${note.id}`);

    // Upload file
    let file = null;
    let finalVersionFileName = null;

    if (!skipFileUpload) {
      const pdfBuffer = pdfData.pdfBuffer;
      const sanitizedDealNameBase = dealName ? dealName.replace(/[^a-zA-Z0-9-_.]/g, "_") : "deal";
      const fallbackBase = `${sanitizedDealNameBase || "deal"}_v1`;
      finalVersionFileName = buildNormalizedFileName(pdfData.fileName, fallbackBase);

      const fileResult = await uploadBiginFile(deal.id, pdfBuffer, finalVersionFileName);

      if (!fileResult.success) {
        console.error(`❌ Failed to upload file, but deal and note exist: ${deal.id}, ${note.id}`);
        return res.status(500).json({
          success: false,
          error: `Deal and note created but failed to upload file: ${fileResult.error?.message}`,
          dealId: deal.id,
          noteId: note.id,
          retryable: true,
          suggestion: "Deal and note were created in Zoho. You can try uploading again.",
          zohoStatus: "deal_note_created_file_failed",
        });
      }

      file = fileResult.file;
      console.log(`✅ File uploaded: ${file.id}`);
    }

    // Create mapping
    const mapping = new ZohoMapping({
      agreementId,
      zohoCompany: {
        id: companyId,
        name: companyName,
        createdByUs: false,
      },
      zohoDeal: {
        id: deal.id,
        name: deal.name,
        pipelineName: "Default",
        stage: validatedStage,
      },
      moduleName: "Pipelines",
      lastUploadStatus: "success",
      lastError: null,
    });

    if (!skipFileUpload && file) {
      mapping.addUpload({
        zohoNoteId: note.id,
        zohoFileId: file.id,
        noteText: noteText.trim(),
        fileName: finalVersionFileName,
        uploadedBy: "system",
      });
    }

    await mapping.save();

    console.log(`✅ First-time upload completed successfully!`);

    res.json({
      success: true,
      message: "Successfully uploaded to Zoho Bigin",
      data: {
        deal: {
          id: deal.id,
          name: deal.name,
          stage: deal.stage,
          amount: dealAmount,
        },
        note: {
          id: note.id,
          title: note.title,
        },
        file: !skipFileUpload && file ? {
          id: file.id,
          fileName: finalVersionFileName,
        } : null,
        mapping: {
          id: mapping._id,
          version: 1,
        },
      },
    });

    Promise.resolve()
      .then(() => recalcCommissionForAgreement(agreementId, companyId))
      .then((r) => {
        console.log(`[COMMISSION-AUTO] connect recalc result for ${agreementId}:`, JSON.stringify(r));
      })
      .catch((err) => {
        console.error(`[COMMISSION-AUTO] Recalc after Bigin connect failed for ${agreementId}:`, err?.message);
      });
  } catch (error) {
    console.error("❌ First-time upload failed:", error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * Update upload to existing Zoho deal
 */
export async function updateUpload(req, res) {
  try {
    const { agreementId } = req.params;
    const {
      noteText,
      dealId: providedDealId,
      skipNoteCreation,
      versionId,
      versionFileName,
      skipFileUpload = false,
    } = req.body;

    console.log(`🔄 Starting update upload for agreement: ${agreementId}`);

    if (!noteText || !noteText.trim()) {
      return res.status(400).json({
        success: false,
        error: "Note text is required for updates",
      });
    }

    const agreement = await CustomerHeaderDoc.findById(agreementId);
    if (!agreement) {
      return res.status(404).json({
        success: false,
        error: "Agreement not found",
      });
    }

    let pdfData = null;
    let versionDoc = null;

    if (!skipFileUpload) {
      console.log(`🔄 [ZOHO-UPLOAD] Getting version document for on-demand PDF compilation...`);

      if (versionId) {
        versionDoc = await VersionPdf.findOne({
          _id: versionId,
          agreementId: agreementId,
          status: { $ne: "archived" },
        }).select("_id versionNumber payloadSnapshot fileName");
      } else {
        versionDoc = await VersionPdf.findOne({
          agreementId: agreementId,
          status: { $ne: "archived" },
        })
          .sort({ versionNumber: -1 })
          .select("_id versionNumber payloadSnapshot fileName");
      }

      if (!versionDoc || !versionDoc.payloadSnapshot) {
        return res.status(400).json({
          success: false,
          error: "Version document not found or missing data for PDF compilation",
        });
      }

      const compiledPdf = await compileCustomerHeader(versionDoc.payloadSnapshot, { watermark: false });

      if (!compiledPdf || !compiledPdf.buffer) {
        return res.status(500).json({
          success: false,
          error: "Failed to compile PDF for upload",
        });
      }

      pdfData = {
        pdfBuffer: compiledPdf.buffer,
        source: "On-Demand Compilation",
        version: versionDoc.versionNumber,
        versionId: versionDoc._id,
        fileName: versionDoc.fileName || `version_${versionDoc.versionNumber}.pdf`,
        sizeBytes: compiledPdf.buffer.length,
        bufferSize: compiledPdf.buffer.length,
      };
    }

    let dealId, dealName, nextVersion, mapping;

    if (providedDealId) {
      dealId = providedDealId;
      mapping = await ZohoMapping.findByAgreementId(agreementId);
      if (mapping) {
        nextVersion = mapping.getNextVersion();
        dealName = mapping.zohoDeal.name;
      } else {
        nextVersion = 1;
        dealName = `Bulk Upload Deal ${dealId}`;
      }
    } else {
      mapping = await ZohoMapping.findByAgreementId(agreementId);
      if (!mapping) {
        return res.status(400).json({
          success: false,
          error: "No existing Zoho mapping found. Use first-time upload instead.",
        });
      }

      nextVersion = mapping.getNextVersion();
      dealId = mapping.zohoDeal.id;
      dealName = mapping.zohoDeal.name;
    }

    const fallbackVersionBase = `Version_${skipFileUpload ? nextVersion : pdfData?.version || nextVersion}`;
    let finalVersionFileName = null;

    if (!skipFileUpload) {
      const incomingVersionFileName = versionFileName || pdfData.fileName || fallbackVersionBase;
      finalVersionFileName = buildNormalizedFileName(incomingVersionFileName, fallbackVersionBase);
    }

    // Create note
    let note = null;
    if (!skipNoteCreation) {
      let noteContent = noteText.trim();
      if (!skipFileUpload && finalVersionFileName) {
        noteContent = `${noteContent}${noteContent ? "\n\n" : ""}Uploaded File: ${finalVersionFileName}`;
      }

      const noteTitle = finalVersionFileName || `Note update ${new Date().toISOString()}`;
      const noteResult = await createBiginNote(dealId, {
        title: noteTitle,
        content: noteContent,
      });

      if (!noteResult.success) {
        return res.status(500).json({
          success: false,
          error: `Failed to create note: ${noteResult.error?.message || "Unknown error"}`,
        });
      }

      note = noteResult.note;
      console.log(`✅ Note created: ${note.id}`);
    }

    // Upload file
    let file = null;
    if (!skipFileUpload) {
      const pdfBuffer = pdfData.pdfBuffer;

      if (!Buffer.isBuffer(pdfBuffer)) {
        return res.status(500).json({
          success: false,
          error: "Invalid PDF buffer format",
        });
      }

      const fileResult = await uploadBiginFile(dealId, pdfBuffer, finalVersionFileName);

      if (!fileResult.success) {
        return res.status(500).json({
          success: false,
          error: `Note created but failed to upload file: ${fileResult.error?.message}`,
          noteId: note?.id || null,
        });
      }

      file = fileResult.file;
      console.log(`✅ File uploaded: ${file.id}`);
    }

    // Update mapping
    if (!skipFileUpload && mapping) {
      mapping.addUpload({
        zohoNoteId: note?.id || null,
        zohoFileId: file.id,
        noteText: noteText.trim(),
        fileName: finalVersionFileName,
        uploadedBy: "system",
      });
      await mapping.save();
    }

    console.log(`✅ Update upload completed successfully!`);

    res.json({
      success: true,
      message: skipFileUpload
        ? `Successfully added note to Zoho deal ${dealName}`
        : `Successfully uploaded version ${nextVersion} to existing Zoho deal`,
      data: {
        deal: { id: dealId, name: dealName },
        note: note ? { id: note.id, title: note.title } : null,
        file: file ? { id: file.id, fileName: finalVersionFileName } : null,
        mapping: mapping ? {
          id: mapping._id,
          version: nextVersion,
          totalVersions: mapping.currentVersion,
        } : null,
      },
    });

    Promise.resolve()
      .then(() => recalcCommissionForAgreementById(agreementId))
      .then((r) => {
        console.log(`[COMMISSION-AUTO] update-upload recalc result for ${agreementId}:`, JSON.stringify(r));
      })
      .catch((err) => {
        console.error(`[COMMISSION-AUTO] Recalc after update-upload failed for ${agreementId}:`, err?.message);
      });
  } catch (error) {
    console.error("❌ Update upload failed:", error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * Add attached file to deal
 */
export async function addAttachedFileToDeal(req, res) {
  try {
    const { fileId } = req.params;
    const { dealId, noteText, skipNoteCreation = false } = req.body;

    console.log(`📎 Adding attached file ${fileId} to deal ${dealId}`);

    if (!fileId || !dealId) {
      return res.status(400).json({
        success: false,
        error: "File ID and Deal ID are required",
      });
    }

    // Find the manual upload document
    const manualDoc = await ManualUploadDocument.findById(fileId);
    if (!manualDoc) {
      return res.status(404).json({
        success: false,
        error: "Attached file not found",
      });
    }

    if (!manualDoc.pdfBuffer) {
      return res.status(400).json({
        success: false,
        error: "File has no PDF data",
      });
    }

    const pdfBuffer = Buffer.isBuffer(manualDoc.pdfBuffer)
      ? manualDoc.pdfBuffer
      : Buffer.from(manualDoc.pdfBuffer);

    const fileName = manualDoc.originalFileName || manualDoc.fileName || `file_${fileId}.pdf`;

    // Upload file to Zoho
    const fileResult = await uploadBiginFile(dealId, pdfBuffer, fileName);

    if (!fileResult.success) {
      return res.status(500).json({
        success: false,
        error: `Failed to upload file: ${fileResult.error?.message}`,
      });
    }

    console.log(`✅ File uploaded to Zoho: ${fileResult.file.id}`);

    // Create note if requested
    let note = null;
    if (!skipNoteCreation && noteText) {
      const noteResult = await createBiginNote(dealId, {
        title: `Attached: ${fileName}`,
        content: noteText.trim(),
      });

      if (noteResult.success) {
        note = noteResult.note;
        console.log(`✅ Note created: ${note.id}`);
      }
    }

    res.json({
      success: true,
      message: "File added to deal successfully",
      data: {
        file: {
          id: fileResult.file.id,
          fileName: fileName,
        },
        note: note ? { id: note.id } : null,
      },
    });
  } catch (error) {
    console.error("❌ Failed to add attached file to deal:", error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}
