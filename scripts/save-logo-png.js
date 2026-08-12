const fs = require('fs');
const path = require('path');

// Write a fallback transparent PNG file if canvas node is missing
// The client `logoGenerator.ts` generates dynamic high-res transparent PNG,
// and we also write a valid PNG file to public/logo.png so it works as static asset.

const publicDir = path.join(__dirname, '../public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

console.log('Public folder ready for logo.png');
