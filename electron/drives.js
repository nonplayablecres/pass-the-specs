// Drive tester: lists drives, reads their health, scans for bad sectors and measures speed.
// Nothing here ever writes to the drive itself. The write-speed test makes one temporary
// file on the drive's own partition and deletes it straight after.
//
// Windows: drives.ps1 for the list + health; the scan reads \\.\PhysicalDriveN directly
//          (needs the app running as admin, which it asks for when it starts).
// Mac:     diskutil for the list + health; write speed on a mounted volume.
//          (macOS doesn't let apps read the raw disk without root, so no surface scan.)

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
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

// ---- Raw reading (Windows) -------------------------------------------------

const ALIGN = 4096;
const alignDown = (n) => Math.floor(n / ALIGN) * ALIGN;

async function openRaw(number) {
  const test = process.env.PTS_RAW_TEST; // developer testing only: a file standing in for a disk
  if (process.platform !== 'win32' && !test) throw new Error('Surface scan needs Windows');
  try {
    return await fs.promises.open(test || `\\\\.\\PhysicalDrive${Number(number)}`, 'r');
  } catch (err) {
    throw new Error(err.code === 'EPERM' || err.code === 'EACCES' ? 'Windows blocked reading the drive. Close the app and open it again, choosing Yes when Windows asks.' : err.message);
  }
}

// Read one block; returns ms taken, or -1 if it couldn't be read
async function readBlock(fh, buf, offset, length) {
  const t = performance.now();
  try {
    const { bytesRead } = await fh.read(buf, 0, length, offset);
    if (bytesRead < length) return -1;
    return performance.now() - t;
  } catch {
    return -1;
  }
}

// Re-read a failed block in small pieces to count how much is actually bad
async function measureBad(fh, offset, length) {
  const piece = 64 * 1024;
  const buf = Buffer.alloc(piece);
  let bad = 0;
  for (let o = offset; o < offset + length; o += piece) {
    if (job && job.stop) break;
    if ((await readBlock(fh, buf, o, piece)) < 0) bad += piece;
  }
  return bad;
}

// mode 'quick': ~2000 spots spread over the whole drive + the start and end
// mode 'full' : every block, start to finish
async function scan({ number, mode, sizeBytes, media }, send) {
  const fh = await openRaw(number);
  job = { stop: false };
  const size = alignDown(sizeBytes);
  const isHdd = /hdd/i.test(media || '');
  const block = mode === 'full' ? 8 * MB : MB;
  const slowMsPerMB = isHdd ? 60 : 25; // slower than this = a weak area
  const offsets = [];
  if (mode === 'full') {
    for (let o = 0; o < size; o += block) offsets.push(o);
  } else {
    const edge = Math.min(256 * MB, size / 4);
    for (let o = 0; o < edge; o += block) offsets.push(o, alignDown(size - edge + o));
    const spots = 2000;
    for (let i = 0; i < spots; i++) offsets.push(alignDown((size - block) * (i / (spots - 1))));
  }
  const total = offsets.reduce((sum, o) => sum + Math.min(block, size - o), 0);
  const res = { mode, done: 0, total, badBytes: 0, badSpots: [], slow: 0, blocks: 0, startedAt: Date.now() };
  const buf = Buffer.alloc(block);
  let lastSend = 0;
  try {
    for (const o of offsets) {
      if (job.stop) { res.stopped = true; break; }
      const len = Math.min(block, size - o);
      if (len <= 0) continue;
      const ms = await readBlock(fh, buf, o, len);
      res.blocks++;
      if (ms < 0) {
        const bad = await measureBad(fh, o, len);
        res.badBytes += bad || len;
        if (res.badSpots.length < 20) res.badSpots.push(Math.round(o / MB));
      } else if (ms / (len / MB) > slowMsPerMB) {
        res.slow++;
      }
      res.done += len;
      const now = Date.now();
      if (now - lastSend > 250) {
        lastSend = now;
        const secs = (now - res.startedAt) / 1000;
        send({ ...res, speed: res.done / MB / Math.max(secs, 0.001), eta: secs > 2 ? ((total - res.done) / res.done) * secs : null });
      }
    }
  } finally {
    await fh.close().catch(() => {});
    job = null;
  }
  const secs = (Date.now() - res.startedAt) / 1000;
  return { ok: true, ...res, speed: res.done / MB / Math.max(secs, 0.001), seconds: secs };
}

// ---- Speed -----------------------------------------------------------------

// Sequential read straight from the disk (no file cache), several reads at once like a benchmark
async function readSpeed(number, sizeBytes, seconds = 5) {
  const fh = await openRaw(number);
  const chunk = 8 * MB;
  const depth = 4;
  const size = alignDown(sizeBytes);
  const limit = Math.min(size, 4096 * MB);
  let pos = 0;
  let bytes = 0;
  const t0 = performance.now();
  const worker = async () => {
    const buf = Buffer.alloc(chunk);
    while (performance.now() - t0 < seconds * 1000 && !(job && job.stop)) {
      const o = pos;
      pos += chunk;
      if (pos > limit) pos = 0;
      const { bytesRead } = await fh.read(buf, 0, chunk, o);
      bytes += bytesRead;
    }
  };
  try {
    await Promise.all(Array.from({ length: depth }, worker));
  } finally {
    await fh.close().catch(() => {});
  }
  return bytes / MB / ((performance.now() - t0) / 1000);
}

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

async function speed({ number, sizeBytes, volumes }, send) {
  job = { stop: false };
  const out = { ok: true, read: null, write: null, notes: [] };
  try {
    if (process.platform === 'win32') {
      send({ phase: 'read' });
      try { out.read = await readSpeed(number, sizeBytes); } catch (err) { out.notes.push('Read test: ' + err.message); }
    } else {
      out.notes.push('Read speed needs Windows (macOS doesn’t let apps read the drive directly)');
    }
    const vol = (volumes || []).filter((v) => v.free > 200 * MB).sort((a, b) => b.free - a.free)[0];
    if (vol) {
      send({ phase: 'write' });
      try { out.write = await writeSpeed(vol); } catch (err) { out.notes.push('Write test: ' + err.message); }
    } else {
      out.notes.push('No partition with free space, so write speed wasn’t tested (format the drive to test it)');
    }
  } finally {
    job = null;
  }
  return out;
}

function stop() {
  if (job) job.stop = true;
  return { ok: true };
}

module.exports = { listDrives, scan, speed, stop };
