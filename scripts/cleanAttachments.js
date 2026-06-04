// scripts/cleanAttachments.js
import mongoose from 'mongoose';
import CustomerHeaderDoc from '../src/models/CustomerHeaderDoc.js';
import dotenv from 'dotenv';

dotenv.config();

function isCorruptAttachment(attachment) {
  return !attachment.manualDocumentId || !mongoose.isValidObjectId(attachment.manualDocumentId);
}

async function processDocument(doc) {
  const originalCount = doc.attachedFiles?.length || 0;
  if (!doc.attachedFiles?.length) return null;

  const corruptAttachments = doc.attachedFiles.filter(isCorruptAttachment);
  if (!corruptAttachments.length) return null;

  const cleanAttachments = doc.attachedFiles.filter(a => !isCorruptAttachment(a));

  console.log(`\n🗂️  Document: ${doc._id}`);
  console.log(`   Title: ${doc.payload?.headerTitle || 'No title'}`);
  console.log(`   Corrupt attachments: ${corruptAttachments.length}/${originalCount}`);
  corruptAttachments.forEach((corrupt, i) => {
    console.log(`   [${i + 1}] fileName: "${corrupt.fileName || 'N/A'}", manualDocumentId: ${corrupt.manualDocumentId || 'undefined'}`);
  });

  await CustomerHeaderDoc.updateOne(
    { _id: doc._id },
    { $set: { attachedFiles: cleanAttachments, updatedAt: new Date() } }
  );

  console.log(`   ✅ Document ${doc._id} cleaned successfully`);
  return { corruptCount: corruptAttachments.length, docId: doc._id };
}

async function cleanCorruptAttachments() {
  try {
    console.log('🔧 Starting attachment cleanup process...');
    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI || "mongodb://localhost:27017/enviromaster");
    console.log('✅ Connected to MongoDB');

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
      const result = await processDocument(doc);
      if (result) {
        corruptDocsCount++;
        cleanedAttachmentsCount += result.corruptCount;
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