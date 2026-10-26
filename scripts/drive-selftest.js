// Developer check, run on a Windows test machine: `npx electron scripts/drive-selftest.js [letter]`
// Runs the drive tests inside Electron on the drive with that letter (default: the first drive).
const { app } = require('electron');
const path = require('path');
const drives = require('../electron/drives');

app.whenReady().then(async () => {
  const say = (title, msg) => console.log(`::notice title=${title}::${String(msg).replace(/\r?\n/g, ' / ')}`);
  const letter = (process.argv.find((a) => /^[A-Z]$/i.test(a)) || '').toUpperCase();
  try {
    const list = await drives.listDrives(path.join(__dirname, '..', 'public', 'checks'));
    const d = letter ? list.drives.find((x) => (x.volumes || []).some((v) => v.letter === letter)) : list.drives[0];
    say('drive', `${d.model} ${d.bus} ${d.media} ${d.sizeBytes} vols=${JSON.stringify(d.volumes)}`);
    const scan = await drives.scan('', { number: d.number, mode: 'quick', sizeBytes: d.sizeBytes, media: d.media, volumes: d.volumes, flash: !!letter }, () => {});
    say('scan', JSON.stringify({ ok: scan.ok, error: scan.error, details: scan.details, blocks: scan.blocks, bad: scan.badBytes, speed: Math.round(scan.speed || 0), note: scan.note }));
    const sp = await drives.speed('', { number: d.number, sizeBytes: d.sizeBytes, volumes: d.volumes, flash: !!letter }, () => {});
    say('speed', JSON.stringify(sp));
    const cap = await drives.capacity('', { volumes: d.volumes, limitBytes: 256 * 1024 * 1024 }, () => {});
    say('capacity', JSON.stringify({ ok: cap.ok, error: cap.error, written: cap.written, bad: cap.badBytes, cached: cap.cached, secs: Math.round(cap.seconds) }));
    if (letter) {
      // How does opening the card for writing behave inside Electron?
      const ofs = require('original-fs');
      const dev = `\\\\.\\PhysicalDrive${d.number}`;
      const tries = [];
      for (const [label, mod, flag] of [['fs r+', require('fs'), 'r+'], ['original-fs r+', ofs, 'r+'], ['fs r', require('fs'), 'r'], ['original-fs rs+', ofs, 'rs+']]) {
        try { const fd = mod.openSync(dev, flag); mod.closeSync(fd); tries.push(label + ' ok'); } catch (e) { tries.push(`${label} ${e.code} ${e.errno}`); }
      }
      say('open', tries.join(' | '));
      const ps = require('child_process').spawnSync('powershell', ['-NoProfile', '-Command', `Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public static class K{[DllImport("kernel32.dll",SetLastError=true,CharSet=CharSet.Unicode)]public static extern IntPtr CreateFile(string a,uint b,uint c,IntPtr d,uint e,uint f,IntPtr g);}'; $h=[K]::CreateFile('${dev.replace(/\\/g, '\\')}',0xC0000000,3,[IntPtr]::Zero,3,0x02000000,[IntPtr]::Zero); "handle=$h err=$([Runtime.InteropServices.Marshal]::GetLastWin32Error())"`]);
      say('createfile', String(ps.stdout || ps.stderr).trim());
      const pr = await drives.probe(path.join(__dirname, '..', 'public', 'checks'), { number: d.number, sizeBytes: d.sizeBytes, volumes: d.volumes }, () => {});
      say('probe', JSON.stringify({ ok: pr.ok, error: pr.error, details: pr.details, bad: pr.badSpots, real: pr.realBytes, warning: pr.warning, restored: pr.restored, retries: pr.retries, details: pr.details, secs: pr.seconds }));
    }
  } catch (err) {
    say('error', err.stack);
  }
  app.quit();
});
