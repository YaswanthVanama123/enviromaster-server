// scripts/cleanAttachments.js
import mongoose from 'mongoose';
import CustomerHeaderDoc from '../src/models/CustomerHeaderDoc.js';
import dotenv from 'dotenv';

dotenv.config();

async function cleanCorruptAttachments() {
  try {
    console.log('🔧 Starting attachment cleanup process...');
    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI || "mongodb://localhost:27017/enviromaster");
    console.log('✅ Connected to MongoDB');

    // Find all documents to check attachment integrity
    console.log('\n🔍 Searching for documents with corrupt attachments...');

    const allDocs = await CustomerHeaderDoc.find({}, {
      _id: 1,
      'payload.headerTitle': 1,
      attachedFiles: 1
    });

    console.log(`📊 Found ${allDocs.length} total documents to check`);

    let corruptDocsCount = 0;
    let cleanedAttachmentsCount = 0;

    for (const doc of allDocs) {
      const originalAttachmentCount = doc.attachedFiles ? doc.attachedFiles.length : 0;

      if (!doc.attachedFiles || doc.attachedFiles.length === 0) {
        continue; // Skip documents with no attachments
      }

      // Find corrupt attachments
      const corruptAttachments = doc.attachedFiles.filter(attachment =>
        !attachment.manualDocumentId ||
        !mongoose.isValidObjectId(attachment.manualDocumentId)
      );

      if (corruptAttachments.length > 0) {
        corruptDocsCount++;
        cleanedAttachmentsCount += corruptAttachments.length;

        console.log(`\n🗂️  Document: ${doc._id}`);
        console.log(`   Title: ${doc.payload?.headerTitle || 'No title'}`);
        console.log(`   Corrupt attachments: ${corruptAttachments.length}/${originalAttachmentCount}`);

        // Show corrupt attachment details
        corruptAttachments.forEach((corrupt, index) => {
          console.log(`   [${index + 1}] fileName: "${corrupt.fileName || 'N/A'}", manualDocumentId: ${corrupt.manualDocumentId || 'undefined'}`);
        });

        // Clean the document - filter out corrupt attachments
        const cleanAttachments = doc.attachedFiles.filter(attachment =>
          attachment.manualDocumentId &&
          mongoose.isValidObjectId(attachment.manualDocumentId)
        );

        console.log(`   🧹 Keeping ${cleanAttachments.length} valid attachments`);

        // Update the document
        await CustomerHeaderDoc.updateOne(
          { _id: doc._id },
          {
            $set: {
              attachedFiles: cleanAttachments,
              updatedAt: new Date()
            }
          }
        );

        console.log(`   ✅ Document ${doc._id} cleaned successfully`);
      }
    }

    console.log('\n📈 CLEANUP SUMMARY:');
    console.log(`   📄 Total documents checked: ${allDocs.length}`);
    console.log(`   🗂️  Documents with corruption: ${corruptDocsCount}`);
    console.log(`   🗑️  Corrupt attachments removed: ${cleanedAttachmentsCount}`);

    if (corruptDocsCount === 0) {
      console.log('   🎉 No corrupt attachments found - database is clean!');
    } else {
      console.log('   ✅ All corrupt attachments have been successfully removed');
    }

    // Verification check
    console.log('\n🔍 Verification: Checking for remaining corruption...');
    const remainingCorruptDocs = await CustomerHeaderDoc.find({
      'attachedFiles': {
        $elemMatch: {
          $or: [
            { manualDocumentId: { $exists: false } },
            { manualDocumentId: null },
            { manualDocumentId: "" }
          ]
        }
      }
    });

    if (remainingCorruptDocs.length === 0) {
      console.log('✅ Verification passed: No remaining corrupt attachments found');
    } else {
      console.log(`⚠️  Warning: Found ${remainingCorruptDocs.length} documents that still have corrupt attachments`);
    }

  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack?.split('\n').slice(0, 5).join('\n')
    });
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
  }
}

// Run the cleanup if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('🚀 Running attachment cleanup script...');
  cleanCorruptAttachments()
    .then(() => {
      console.log('🎯 Cleanup completed successfully!');
      process.exit(0);
    })
    .catch((err) => {
      console.error('💥 Fatal error:', err);
      process.exit(1);
    });
}

export default cleanCorruptAttachments;