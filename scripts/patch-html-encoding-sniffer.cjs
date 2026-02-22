#!/usr/bin/env node
/**
 * Patch html-encoding-sniffer to use createRequire for @exodus/bytes/encoding-lite.js
 * This fixes ERR_REQUIRE_ESM in Vitest when running tests with jsdom environment.
 * 
 * Background: html-encoding-sniffer uses require() on an ES module, which Node.js
 * doesn't support. We replace it with createRequire which handles both CommonJS and ESM.
 */

const fs = require('fs');
const path = require('path');

const filePath = path.join(
  __dirname,
  '../node_modules/html-encoding-sniffer/lib/html-encoding-sniffer.js'
);

try {
  if (!fs.existsSync(filePath)) {
    console.log('✓ html-encoding-sniffer not installed, skipping patch');
    process.exit(0);
  }

  const content = fs.readFileSync(filePath, 'utf-8');

  // Check if already patched
  if (content.includes('createRequire')) {
    console.log('✓ html-encoding-sniffer already patched');
    process.exit(0);
  }

  // Check if file contains the problematic require (with destructuring)
  if (!content.includes("require(\"@exodus/bytes/encoding-lite.js\")")) {
    console.log('✓ html-encoding-sniffer does not contain problematic require, skipping patch');
    process.exit(0);
  }

  // Patch: Add createRequire at top and use it instead of require for encoding-lite
  const lines = content.split('\n');
  const insertIndex = lines.findIndex(line => line.includes("'use strict'")) + 1 || 0;
  
  // Insert createRequire import after 'use strict' or at the top
  lines.splice(insertIndex, 0, "const { createRequire } = require('module');");
  
  const patched = lines
    .join('\n')
    .replace(
      /const { getBOMEncoding, labelToName } = require\("@exodus\/bytes\/encoding-lite\.js"\);/,
      `const { getBOMEncoding, labelToName } = createRequire(__filename)("@exodus/bytes/encoding-lite.js");`
    );

  fs.writeFileSync(filePath, patched, 'utf-8');
  console.log('✓ Patched html-encoding-sniffer to use createRequire');
} catch (err) {
  console.error('Error patching html-encoding-sniffer:', err.message);
  // Don't fail the install, just warn
  process.exit(0);
}
