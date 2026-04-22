// Run this with: node patch.js
// It patches index.html to replace the particle canvas with the new professional background.

const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');

// 1. Replace the canvas element with the new bgCanvas div
html = html.replace(
  '<canvas id="particleCanvas"></canvas>',
  `<div id="bgCanvas" aria-hidden="true">
  <div class="bg-orb bg-orb--1"></div>
  <div class="bg-orb bg-orb--2"></div>
  <div class="bg-orb bg-orb--3"></div>
  <div class="bg-orb bg-orb--4"></div>
</div>`
);

// 2. Remove the particle animation JS block
// Matches from the section comment through animate();
const particleStart = '// ===== PARTICLE CONSTELLATION BACKGROUND =====';
const particleEnd = '    animate();\n';

const startIdx = html.indexOf(particleStart);
const endIdx = html.indexOf(particleEnd, startIdx);

if (startIdx !== -1 && endIdx !== -1) {
  html = html.slice(0, startIdx) + html.slice(endIdx + particleEnd.length);
  console.log('✅ Particle JS block removed');
} else {
  console.log('⚠️  Could not find particle JS block - check manually');
}

// 3. Remove the old #particleCanvas CSS from the inline <style> if present
html = html.replace(
  /\s*#particleCanvas\s*\{[^}]*\}/g,
  ''
);

fs.writeFileSync(htmlPath, html, 'utf8');
console.log('✅ index.html patched successfully!');
console.log('✅ liquid-glass.css already updated with new background styles.');
