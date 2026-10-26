// Developer check, run on a Windows test machine: `npx electron scripts/drive-selftest.js`
// Lists drives and runs a quick read-only scan + speed test on the first one, inside Electron.
const { app } = require('electron');
const path = require('path');
const drives = require('../electron/drives');

app.whenReady().then(async () => {
  const say = (title, msg) => console.log(`::notice title=${title}::${String(msg).replace(/\r?\n/g, ' / ')}`);
  try {
    const list = await drives.listDrives(path.join(__dirname, '..', 'public', 'checks'));
    const d = list.drives[0];
    say('drive', `${d.model} ${d.bus} ${d.sizeBytes} vols=${JSON.stringify(d.volumes)}`);
    const scan = await drives.scan('', { number: d.number, mode: 'quick', sizeBytes: d.sizeBytes, media: d.media, volumes: d.volumes }, () => {});
    say('scan', JSON.stringify({ ok: scan.ok, error: scan.error, details: scan.details, blocks: scan.blocks, bad: scan.badBytes, speed: Math.round(scan.speed || 0), note: scan.note }));
    const sp = await drives.speed('', { number: d.number, sizeBytes: d.sizeBytes, volumes: d.volumes }, () => {});
    say('speed', JSON.stringify(sp));
    const cap = await drives.capacity('', { volumes: d.volumes, limitBytes: 512 * 1024 * 1024 }, () => {});
    say('capacity', JSON.stringify({ ok: cap.ok, error: cap.error, written: cap.written, bad: cap.badBytes, cached: cap.cached, secs: Math.round(cap.seconds) }));
  } catch (err) {
    say('error', err.stack);
  }
  app.quit();
});
