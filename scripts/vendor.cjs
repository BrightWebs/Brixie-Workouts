const fs = require('node:fs');
const path = require('node:path');
const copies = {
  'jsqr/dist/jsQR.js': 'jsQR.js',
  'jsqr/LICENSE': 'jsQR.LICENSE',
  'three/build/three.core.js': 'anatomy/three.core.js',
  'three/build/three.module.js': 'anatomy/three.module.js',
  'three/LICENSE': 'anatomy/THREE-LICENSE'
};
for (const [source, destination] of Object.entries(copies)) {
  const target = path.join(__dirname, '../assets', destination);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(__dirname, '../node_modules', source), target);
}
