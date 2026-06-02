#!/usr/bin/env node
/**
 * Check MongoDB documents for corrupted/invalid characters
 * Run: node scripts/check-corrupted-data.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/enviromaster';

// Connect to MongoDB
await mongoose.connect(MONGODB_URI);
console.log('✅ Connected to MongoDB');

// Get CustomerHeaderDoc model
const CustomerHeaderDoc = mongoose.model('CustomerHeaderDoc', new mongoose.Schema({}, { strict: false }), 'customerHeaderDocs');

// Regex to detect problematic characters
const PROBLEMATIC_CHARS = /[\x00-\x1F\x7F-\xFF\uFFFD]/;
const SMART_QUOTES = /[""'']/;
const EM_DASH = /[—–]/;
const EMOJI = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;

function checkStringValue(value, path, documentId, issues) {
  if (typeof value !== 'string') return;

  const problems = [];

  if (PROBLEMATIC_CHARS.test(value)) {
    problems.push('control/binary chars');
  }
  if (SMART_QUOTES.test(value)) {
    problems.push('smart quotes');
  }
  if (EM_DASH.test(value)) {
    problems.push('em-dash');
  }
  if (EMOJI.test(value)) {
    problems.push('emoji');
  }

  if (problems.length > 0) {
    issues.push({
      documentId,
      path,
      problems: problems.join(', '),
      preview: value.slice(0, 50).replace(/[\x00-\x1F\x7F-\xFF]/g, '?'),
      length: value.length,
      hexDump: Array.from(value.slice(0, 10)).map(c =>
        c.charCodeAt(0).toString(16).padStart(2, '0')
      ).join(' ')
    });
  }
}

function checkObject(obj, path, documentId, issues, visited = new WeakSet()) {
  if (obj === null || obj === undefined) return;

  if (typeof obj !== 'object') {
    checkStringValue(obj, path, documentId, issues);
    return;
  }

  if (visited.has(obj)) return;
  visited.add(obj);

  if (Array.isArray(obj)) {
    obj.forEach((item, index) => {
      checkObject(item, `${path}[${index}]`, documentId, issues, visited);
    });
  } else {
    Object.entries(obj).forEach(([key, value]) => {
      const newPath = path ? `${path}.${key}` : key;
      checkObject(value, newPath, documentId, issues, visited);
    });
  }
}

console.log('\n🔍 Scanning documents for corrupted data...\n');

const documents = await CustomerHeaderDoc.find({}).lean();
console.log(`📊 Found ${documents.length} documents to check\n`);

const allIssues = [];
let corruptedCount = 0;

documents.forEach((doc, index) => {
  const issues = [];
  checkObject(doc, '', doc._id.toString(), issues);

  if (issues.length > 0) {
    corruptedCount++;
    const title = doc.payload?.headerTitle || 'Untitled';
    console.log(`❌ Document ${index + 1}: "${title}" (ID: ${doc._id})`);
    console.log(`   Found ${issues.length} corrupted field(s):\n`);

    issues.forEach((issue, i) => {
      console.log(`   ${i + 1}. Path: ${issue.path}`);
      console.log(`      Problems: ${issue.problems}`);
      console.log(`      Preview: "${issue.preview}"`);
      console.log(`      Hex: ${issue.hexDump}`);
      console.log('');
    });

    allIssues.push(...issues);
  }

  // Progress indicator
  if ((index + 1) % 10 === 0) {
    console.log(`✓ Checked ${index + 1}/${documents.length} documents...`);
  }
});

console.log('\n' + '='.repeat(80));
console.log('\n📊 SUMMARY:\n');
console.log(`Total documents scanned: ${documents.length}`);
console.log(`Documents with corruption: ${corruptedCount}`);
console.log(`Total corrupted fields: ${allIssues.length}\n`);

if (allIssues.length > 0) {
  console.log('🔧 RECOMMENDATIONS:\n');
  console.log('1. Edit each corrupted document in the admin panel');
  console.log('2. Re-type or copy text from a plain text editor (not Word/PDF)');
  console.log('3. Avoid copying text from PDFs or Word documents');
  console.log('4. Save the document to clean the data\n');

  console.log('💡 Common sources of corruption:');
  console.log('   • Smart quotes from Word (curly quotes)');
  console.log('   • Em-dashes from websites');
  console.log('   • Emojis and special symbols');
  console.log('   • Copy-paste from PDFs');
  console.log('   • Special characters from Excel\n');

  // Show top corrupted paths
  const pathCounts = {};
  allIssues.forEach(issue => {
    const simplePath = issue.path.replace(/\[\d+\]/g, '[]');
    pathCounts[simplePath] = (pathCounts[simplePath] || 0) + 1;
  });

  const topPaths = Object.entries(pathCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  if (topPaths.length > 0) {
    console.log('📍 Most commonly corrupted paths:');
    topPaths.forEach(([path, count]) => {
      console.log(`   ${count}× ${path}`);
    });
    console.log('');
  }
}

await mongoose.disconnect();
console.log('✅ Done!');
process.exit(0);
