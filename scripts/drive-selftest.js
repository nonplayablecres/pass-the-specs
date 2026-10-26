// Developer check, run on a Windows test machine: `npx electron scripts/drive-selftest.js [letter]`
// Runs the drive tests inside Electron on the drive with that letter (default: the first drive).
// With a letter it also formats that drive, so only use it on a throwaway test drive.
const { app } = require('electron');
const path = require('path');
const drives = require('../electron/drives');

const checks = path.join(__dirname, '..', 'public', 'checks');
app.whenReady().then(async () => {
  const say = (title, msg) => console.log(`::notice title=${title}::${String(msg).replace(/\r?\n/g, ' / ')}`);
  const letter = (process.argv.find((a) => /^[A-Z]$/i.test(a)) || '').toUpperCase();
  try {
    const list = await drives.listDrives(checks);
    const d = letter ? list.drives.find((x) => (x.volumes || []).some((v) => v.letter === letter)) : list.drives[0];
    say('drive', `${d.model} ${d.bus} ${d.media} ${d.sizeBytes} vols=${JSON.stringify(d.volumes)}`);
    const scan = await drives.scan(checks, { number: d.number, mode: 'quick', sizeBytes: d.sizeBytes, media: d.media, volumes: d.volumes, flash: !!letter }, () => {});
    say('scan', JSON.stringify({ ok: scan.ok, error: scan.error, details: scan.details, blocks: scan.blocks, bad: scan.badBytes, speed: Math.round(scan.speed || 0), note: scan.note }));
    const sp = await drives.speed(checks, { number: d.number, sizeBytes: d.sizeBytes, volumes: d.volumes, flash: !!letter }, () => {});
    say('speed', JSON.stringify(sp));
    if (letter) {
      const f = await drives.format(checks, { number: d.number, sizeBytes: d.sizeBytes, fsType: 'fat32' });
      say('format', JSON.stringify(f));
    }
  } catch (err) {
    say('error', err.stack);
  }
  app.quit();
});
