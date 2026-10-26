// Auto-update: checks your GitHub Releases for a newer "pts-ui.zip".
// If found, it downloads it next to the exe (e.g. on the USB stick) and the
// app switches to it on reload. The exe itself only needs replacing when a
// release says it needs a newer shell (rare).

const { net } = require('electron');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

function parse(v) {
  return String(v || '0.0.0').replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
}

function isNewer(a, b) {
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < 3; i++) {
    if ((x[i] || 0) > (y[i] || 0)) return true;
    if ((x[i] || 0) < (y[i] || 0)) return false;
  }
  return false;
}

function readVersion(dir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, 'version.json'), 'utf8'));
  } catch {
    return null;
  }
}

async function getJson(url) {
  const res = await net.fetch(url, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'pass-the-specs' } });
  if (!res.ok) throw new Error('GitHub replied ' + res.status);
  return res.json();
}

async function checkForUpdate({ repo, currentVersion, shellVersion, dataDir }) {
  if (!repo || repo.startsWith('YOUR-')) return null; // not set up yet

  const release = await getJson(`https://api.github.com/repos/${repo}/releases/latest`);
  const latest = String(release.tag_name || '').replace(/^v/, '');
  if (!isNewer(latest, currentVersion)) return null;

  const asset = (release.assets || []).find((a) => a.name === 'pts-ui.zip');
  if (!asset) return null;

  const res = await net.fetch(asset.browser_download_url, { headers: { 'User-Agent': 'pass-the-specs' } });
  if (!res.ok) throw new Error('Download failed ' + res.status);
  const zip = new AdmZip(Buffer.from(await res.arrayBuffer()));

  const versionEntry = zip.getEntry('version.json');
  if (!versionEntry) throw new Error('Update is missing version.json');
  const meta = JSON.parse(versionEntry.getData().toString('utf8'));

  // This update needs a newer exe: tell the user instead of installing it.
  if (isNewer(meta.minShell || '0.0.0', shellVersion)) {
    return { status: 'needs-exe', version: latest, url: release.html_url };
  }

  const target = path.join(dataDir, 'pts-ui');
  const temp = target + '-download';
  const old = target + '-old';
  fs.rmSync(temp, { recursive: true, force: true });
  fs.rmSync(old, { recursive: true, force: true });
  zip.extractAllTo(temp, true);
  if (fs.existsSync(target)) fs.renameSync(target, old);
  fs.renameSync(temp, target);
  fs.rmSync(old, { recursive: true, force: true });

  return { status: 'ready', version: latest };
}

module.exports = { checkForUpdate, readVersion, isNewer };
