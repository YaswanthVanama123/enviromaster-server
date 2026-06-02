const fs = require('fs');

const src = './src/controllers/pdfController.js';
const dst = './src/controllers/agreement/pdfController.js';

let content = fs.readFileSync(src, 'utf8');

// Update import paths from ../ to ../../
content = content.replace(/"\.\.\/services\//g, '"../../services/');
content = content.replace(/"\.\.\/models\//g, '"../../models/');
content = content.replace(/"\.\.\/middleware\//g, '"../../middleware/');

fs.writeFileSync(dst, content);
console.log('File created successfully');
console.log('Size:', fs.statSync(dst).size, 'bytes');
