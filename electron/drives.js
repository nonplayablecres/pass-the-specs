// Drive tester: lists drives, reads their health, scans for bad sectors and measures speed.
// Nothing here ever writes to the drive itself. The write-speed test makes one temporary
// file on the drive's own partition and deletes it straight after.
//
// Windows: drives.ps1 for the list + health; drive-read.ps1 reads the disk for the scan
//          and read speed (needs the app running as admin, which it asks for when it starts).
// Mac:     diskutil for the list + health; write speed on a mounted volume.
//          (macOS doesn't let apps read the raw disk without root, so no surface scan.)

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { spawn } = require('child_process');
const { run, runScript } = require('./systemInfo');

const MB = 1024 * 1024;
let job = null; // the running scan / speed test, so it can be stopped

// ---- Listing ---------------------------------------------------------------

async function macPlist(args) {
  const out = await run('/bin/sh', ['-c', `diskutil ${args} | plutil -convert json -o - -`], 20000);
  try { return JSON.parse(out); } catch { return null; }
}

async function listMac() {
  const list = await macPlist('list -plist physical');
  const root = await macPlist('info -plist /');
  const drives = [];
  for (const d of (list && list.AllDisksAndPartitions) || []) {
    const info = await macPlist(`info -plist ${d.DeviceIdentifier}`);
    if (!info) continue;
    const vols = [];
    for (const p of [...(d.Partitions || []), ...(d.APFSVolumes || [])]) {
      if (p.MountPoint) {
        const pi = await macPlist(`info -plist ${p.DeviceIdentifier}`);
        vols.push({ letter: p.MountPoint, label: p.VolumeName || '', fs: (pi && pi.FilesystemName) || '', size: p.Size || 0, free: (pi && (pi.APFSContainerFree || pi.FreeSpace)) || 0 });
      }
    }
    const internal = !!info.Internal;
    drives.push({
      number: d.DeviceIdentifier,
      model: info.MediaName || info.IORegistryEntryName || d.DeviceIdentifier,
      serial: '',
      media: info.SolidState ? 'SSD' : 'HDD',
      bus: info.BusProtocol || '',
      sizeBytes: info.TotalSize || info.Size || 0,
      health: info.SMARTStatus === 'Verified' ? 'Healthy' : info.SMARTStatus === 'Failing' ? 'Unhealthy' : 'Unknown',
      smartStatus: info.SMARTStatus || 'Not Supported',
      boot: internal || (root && root.ParentWholeDisk === d.DeviceIdentifier),
      volumes: vols,
      smart: {}
    });
  }
  return drives;
}

async function listDrives(checksDir) {
  try {
    if (process.platform === 'win32') {
      const res = await runScript(checksDir, 'drives.ps1', 60000);
      return { ok: true, drives: Array.isArray(res) ? res : [res] };
    }
    if (process.platform === 'darwin') return { ok: true, drives: await listMac() };
    return { ok: false, error: 'Not supported on this system' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ---- Reading the drive (Windows) -------------------------------------------
// Done by checks/drive-read.ps1 (it ships with the screens, so fixes arrive as normal
// updates). It prints "P {progress}" lines and a final "R {result}" or "E {error}".

function readScript(checksDir, args, send) {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') { resolve({ ok: false, error: 'Needs Windows' }); return; }
    const source = fs.readFileSync(path.join(checksDir, 'drive-read.ps1'), 'utf8');
    const temp = path.join(os.tmpdir(), 'pts-drive-read.ps1');
    fs.writeFileSync(temp, source, 'utf8');
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', temp, ...args], { windowsHide: true });
    job = { stop: false, child };
    let result = null;
    let stderr = '';
    let buffer = '';
    const line = (l) => {
      const kind = l.slice(0, 2);
      if (!['P ', 'R ', 'E '].includes(kind)) return;
      let data;
      try { data = JSON.parse(l.slice(2)); } catch { return; }
      if (kind === 'P ') send(data);
      else if (kind === 'R ') result = { ok: true, ...data };
      else result = { ok: false, error: data.error };
    };
    child.stdout.on('data', (d) => {
      buffer += d.toString();
      let i;
      while ((i = buffer.indexOf('\n')) !== -1) { line(buffer.slice(0, i).trim()); buffer = buffer.slice(i + 1); }
    });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('close', () => {
      if (buffer.trim()) line(buffer.trim());
      const stopped = job && job.stop;
      job = null;
      if (result) resolve(result);
      else if (stopped) resolve({ ok: true, stopped: true });
      else resolve({ ok: false, error: (stderr.trim().split('\n').pop() || 'The drive test stopped unexpectedly').slice(0, 300) });
    });
  });
}

async function scan(checksDir, { number, mode, sizeBytes, media }, send) {
  const res = await readScript(checksDir, ['-Disk', String(Number(number)), '-Mode', mode === 'full' ? 'full' : 'quick', '-Size', String(Math.floor(sizeBytes)), '-Hdd', /hdd/i.test(media || '') ? '1' : '0'], (p) => send({ ...p, mode }));
  return { mode, ...res };
}

// ---- Speed -----------------------------------------------------------------

// Writes a temporary file on one of the drive's partitions, flushes it to the drive, deletes it
async function writeSpeed(volume) {
  const root = /^[A-Z]$/i.test(volume.letter) ? volume.letter + ':\\' : volume.letter;
  const free = Number(volume.free) || 0;
  const total = Math.min(1024 * MB, Math.floor((free * 0.5) / (8 * MB)) * 8 * MB);
  if (total < 128 * MB) throw new Error('Not enough free space on the drive for the write test');
  const file = path.join(root, `PTS-speedtest-${Date.now()}.tmp`);
  const data = crypto.randomBytes(8 * MB); // random so drives can't cheat by compressing
  const fh = await fs.promises.open(file, 'w');
  const t0 = performance.now();
  try {
    for (let done = 0; done < total && !(job && job.stop); done += data.length) await fh.write(data, 0, data.length);
    await fh.sync();
  } finally {
    await fh.close().catch(() => {});
  }
  const secs = (performance.now() - t0) / 1000;
  await fs.promises.unlink(file).catch(() => {});
  return total / MB / secs;
}

async function speed(checksDir, { number, sizeBytes, volumes }, send) {
  const out = { ok: true, read: null, write: null, notes: [] };
  if (process.platform === 'win32') {
    send({ phase: 'read' });
    const r = await readScript(checksDir, ['-Disk', String(Number(number)), '-Mode', 'speed', '-Size', String(Math.floor(sizeBytes))], () => {});
    if (r.stopped) return { ...out, stopped: true };
    if (r.ok && r.read != null) out.read = r.read;
    else out.notes.push('Read test: ' + r.error);
  } else {
    out.notes.push('Read speed needs Windows (macOS doesn’t let apps read the drive directly)');
  }
  const vol = (volumes || []).filter((v) => v.free > 200 * MB).sort((a, b) => b.free - a.free)[0];
  if (vol) {
    send({ phase: 'write' });
    job = { stop: false };
    try { out.write = await writeSpeed(vol); } catch (err) { out.notes.push('Write test: ' + err.message); } finally { job = null; }
  } else {
    out.notes.push('No partition with free space, so write speed wasn’t tested (format the drive to test it)');
  }
  return out;
}

function stop() {
  if (job) {
    job.stop = true;
    if (job.child) job.child.kill();
  }
  return { ok: true };
}

module.exports = { listDrives, scan, speed, stop };
