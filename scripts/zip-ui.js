// Runs after "vite build". Stamps the version into dist/version.json and
// zips dist/ into release/pts-ui.zip, which is what the auto-updater downloads.
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const pkg = require('../package.json');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const out = path.join(root, 'release');

fs.writeFileSync(
  path.join(dist, 'version.json'),
  JSON.stringify({ version: pkg.version, minShell: (pkg.pts && pkg.pts.minShell) || '0.0.0' }, null, 2)
);

fs.mkdirSync(out, { recursive: true });
const zip = new AdmZip();
zip.addLocalFolder(dist);
zip.writeZip(path.join(out, 'pts-ui.zip'));
console.log(`Built release/pts-ui.zip (v${pkg.version})`);
