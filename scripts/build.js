const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.join(__dirname, '..');
const source = path.join(projectRoot, 'public');
const destination = path.join(projectRoot, 'dist');

fs.rmSync(destination, { recursive: true, force: true });
fs.cpSync(source, destination, { recursive: true });
console.log('Build listo: archivos web copiados a dist/.');