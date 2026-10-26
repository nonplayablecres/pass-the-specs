// Drive tester: lists drives, reads their health, scans for bad sectors and measures speed.
// Nothing here ever writes to the drive itself. The write-speed test makes one temporary
// file on the drive's own partition and deletes it straight after.
//
// Windows: drives.ps1 for the list + health; the scan and read speed read the drive
//          directly, read-only (needs the app running as admin, which it asks for when it starts).
// Mac:     diskutil for the list + health; write speed on a mounted volume.
//          (macOS doesn't let apps read the raw disk without root, so no surface scan.)

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
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
// Read-only: the drive is only ever opened for reading.

const ALIGN = 4096;
const alignDown = (n) => Math.floor(n / ALIGN) * ALIGN;
const MAP_CELLS = 600; // squares in the sector map

// Is the app running as administrator? (needed to read a drive directly)
function isAdmin() {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') { resolve(false); return; }
    execFile('net', ['session'], { windowsHide: true }, (err) => resolve(!err));
  });
}

const errText = (err) => (err ? [err.code, err.errno, err.syscall].filter((x) => x != null).join(' ') : 'ok');

// Opens the whole drive. Tries the usual name, then two other names Windows uses for it,
// then (last resort) one of its partitions. Every try is checked with a real read, and
// what happened is kept so a failure can be explained. Returns { fh, size, note }.
async function openRaw(d) {
  const test = process.env.PTS_RAW_TEST; // developer testing only: a file standing in for a disk
  if (test) return { fh: await fs.promises.open(test, 'r'), size: d.sizeBytes };
  if (process.platform !== 'win32') throw new Error('Reading the whole drive needs Windows');
  const n = Number(d.number);
  const tries = [
    { p: `\\\\.\\PhysicalDrive${n}`, size: d.sizeBytes },
    { p: `\\\\?\\GLOBALROOT\\Device\\Harddisk${n}\\Partition0`, size: d.sizeBytes },
    { p: `\\\\?\\GLOBALROOT\\Device\\Harddisk${n}\\DR${n}`, size: d.sizeBytes },
    ...(d.volumes || []).filter((x) => /^[A-Z]$/i.test(x.letter)).sort((a, b) => b.size - a.size)
      .map((v) => ({ p: `\\\\.\\${v.letter}:`, size: Number(v.size), note: `Scanned the ${v.letter}: partition (Windows wouldn’t open the whole drive)` }))
  ];
  const log = [`admin=${await isAdmin()}`, `electron=${process.versions.electron} node=${process.versions.node} uv=${process.versions.uv}`];
  for (const t of tries) {
    let fh = null;
    try {
      fh = await fs.promises.open(t.p, 'r');
    } catch (err) {
      log.push(`${t.p} open: ${errText(err)}`);
      continue;
    }
    const buf = Buffer.alloc(MB);
    try {
      await fh.read(buf, 0, MB, 0);
      await fh.read(buf, 0, MB, alignDown(t.size / 2));
      return { fh, size: t.size, note: t.note, log };
    } catch (err) {
      log.push(`${t.p} read: ${errText(err)}`);
      await fh.close().catch(() => {});
    }
    // Same again with the older (non-promise) calls, in case only those work
    try {
      const fd = fs.openSync(t.p, 'r');
      try { fs.readSync(fd, buf, 0, 4096, 0); log.push(`${t.p} sync read: ok`); } catch (err) { log.push(`${t.p} sync read: ${errText(err)}`); }
      fs.closeSync(fd);
    } catch (err) { log.push(`${t.p} sync open: ${errText(err)}`); }
  }
  const e = new Error(log[0] === 'admin=false'
    ? 'The app isn’t running as administrator, so Windows won’t let it read the drive. Close it and open it again, choosing Yes when Windows asks.'
    : 'Windows wouldn’t let the app read this drive.');
  e.details = log.join('\n');
  throw e;
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
// The map is one character per square: . not read yet, g good, s slow, b bad
async function scan(_checksDir, { number, mode, sizeBytes, media, volumes, flash }, send) {
  job = { stop: false };
  let opened;
  try {
    opened = await openRaw({ number, sizeBytes, volumes });
  } catch (err) {
    job = null;
    return { ok: false, mode, error: err.message, details: err.details };
  }
  const { fh, note } = opened;
  const size = alignDown(opened.size);
  const isHdd = /hdd/i.test(media || '');
  const block = mode === 'full' ? 8 * MB : MB;
  const slowMsPerMB = isHdd ? 60 : 25; // slower than this = a weak area
  const offsets = [];
  if (mode === 'full') {
    for (let o = 0; o < size; o += block) offsets.push(o);
  } else {
    const spots = flash ? 600 : 2400; // cards are slower, so fewer spots keeps it quick
    for (let i = 0; i < spots; i++) offsets.push(alignDown((size - block) * (i / (spots - 1))));
    offsets.sort((x, y) => x - y);
  }
  const total = offsets.reduce((sum, o) => sum + Math.max(0, Math.min(block, size - o)), 0);
  const map = new Array(MAP_CELLS).fill('.');
  const rank = { '.': 0, g: 1, s: 2, b: 3 };
  const mark = (o, len, v) => {
    const from = Math.floor((o / size) * MAP_CELLS);
    const to = Math.min(MAP_CELLS - 1, Math.floor(((o + len - 1) / size) * MAP_CELLS));
    for (let c = from; c <= to; c++) if (rank[v] > rank[map[c]]) map[c] = v;
  };
  const res = { mode, note, failedInARow: 0, done: 0, total, badBytes: 0, badSpots: [], slow: 0, blocks: 0, startedAt: Date.now() };
  const buf = Buffer.alloc(block);
  let lastSend = 0;
  try {
    for (const o of offsets) {
      if (job.stop) { res.stopped = true; break; }
      const len = Math.min(block, size - o);
      if (len <= 0) continue;
      const ms = await readBlock(fh, buf, o, len);
      res.blocks++;
      // Nothing at all can be read: that's the app being blocked, not bad sectors
      if (ms < 0 && res.blocks === res.failedInARow + 1) res.failedInARow++;
      if (res.failedInARow >= 24) {
        await fh.close().catch(() => {});
        job = null;
        return { ok: false, mode, error: 'Windows opened the drive but wouldn’t let the app read from it, so the scan can’t run.', details: (opened.log || []).join('\n') };
      }
      if (ms < 0) {
        const bad = await measureBad(fh, o, len);
        res.badBytes += bad || len;
        if (res.badSpots.length < 20) res.badSpots.push(Math.round(o / MB));
        mark(o, len, 'b');
      } else if (ms / (len / MB) > slowMsPerMB) {
        res.slow++;
        mark(o, len, 's');
      } else {
        mark(o, len, 'g');
      }
      res.done += len;
      const now = Date.now();
      if (now - lastSend > 250) {
        lastSend = now;
        const secs = (now - res.startedAt) / 1000;
        send({ ...res, map: map.join(''), speed: res.done / MB / Math.max(secs, 0.001), eta: secs > 2 ? ((total - res.done) / res.done) * secs : null });
      }
    }
  } finally {
    await fh.close().catch(() => {});
    job = null;
  }
  const secs = (Date.now() - res.startedAt) / 1000;
  return { ok: true, ...res, map: map.join(''), speed: res.done / MB / Math.max(secs, 0.001), seconds: secs };
}

// Sequential read straight from the disk (no file cache), several reads at once like a benchmark
async function readSpeed(d, seconds = 6) {
  const { fh, size: s } = await openRaw(d);
  const chunk = 8 * MB;
  const limit = Math.max(alignDown(Math.min(s, 4096 * MB)) - chunk, chunk);
  let pos = 0;
  let bytes = 0;
  let lastErr = null;
  const t0 = performance.now();
  const worker = async () => {
    const buf = Buffer.alloc(chunk);
    while (performance.now() - t0 < seconds * 1000 && !(job && job.stop)) {
      const o = pos % limit;
      pos += chunk;
      try { const { bytesRead } = await fh.read(buf, 0, chunk, o); bytes += bytesRead; } catch (err) { lastErr = err; }
    }
  };
  try {
    await Promise.all(Array.from({ length: 4 }, worker));
  } finally {
    await fh.close().catch(() => {});
  }
  if (!bytes) throw new Error('nothing could be read (' + errText(lastErr) + ')');
  return bytes / MB / ((performance.now() - t0) / 1000);
}

// ---- Speed -----------------------------------------------------------------

// Writes a temporary file on one of the drive's partitions (several writes at once, like a
// benchmark), makes sure it has really reached the drive, then deletes it
async function writeSpeed(volume, maxMB = 2048, maxSeconds = 20) {
  const root = /^[A-Z]$/i.test(volume.letter) ? volume.letter + ':\\' : volume.letter;
  const free = Number(volume.free) || 0;
  const chunk = 8 * MB;
  const total = Math.min(maxMB * MB, Math.floor((free * 0.5) / chunk) * chunk);
  if (total < 64 * MB) throw new Error('Not enough free space on the drive for the write test');
  const file = path.join(root, `PTS-speedtest-${Date.now()}.tmp`);
  const data = crypto.randomBytes(chunk); // random so drives can't cheat by compressing
  const fh = await fs.promises.open(file, 'w');
  let pos = 0;
  const t0 = performance.now();
  try {
    const worker = async () => {
      while (pos < total && !(job && job.stop) && performance.now() - t0 < maxSeconds * 1000) {
        const o = pos;
        pos += chunk;
        await fh.write(data, 0, chunk, o);
      }
    };
    await Promise.all(Array.from({ length: 4 }, worker));
    await fh.sync();
  } finally {
    await fh.close().catch(() => {});
  }
  const secs = (performance.now() - t0) / 1000;
  await fs.promises.unlink(file).catch(() => {});
  return Math.min(pos, total) / MB / secs;
}

async function speed(_checksDir, { number, sizeBytes, volumes, flash }, send) {
  const out = { ok: true, read: null, write: null, notes: [] };
  job = { stop: false };
  try {
    if (process.platform === 'win32') {
      send({ phase: 'read' });
      try { out.read = await readSpeed({ number, sizeBytes, volumes }); } catch (err) { out.notes.push('Read test: ' + err.message); if (err.details) out.details = err.details; }
    } else {
      out.notes.push('Read speed needs Windows (macOS doesn’t let apps read the drive directly)');
    }
    if (job.stop) return { ...out, stopped: true };
    const vol = (volumes || []).filter((v) => v.free > 150 * MB).sort((a, b) => b.free - a.free)[0];
    if (vol) {
      send({ phase: 'write' });
      try { out.write = await writeSpeed(vol, flash ? 256 : 2048, flash ? 6 : 20); } catch (err) { out.notes.push('Write test: ' + err.message); }
    } else {
      out.notes.push('No partition with free space, so write speed wasn’t tested (format the drive to test it)');
    }
  } finally {
    job = null;
  }
  return out;
}

// ---- Format ------------------------------------------------------------------
// Only when the tester presses Format and confirms. Uses Windows' own diskpart:
// wipes the partitions, makes one new partition and formats it
// (SD cards / sticks: FAT32 up to 32 GB, exFAT above; hard drives / SSDs: NTFS).
// Never touches this computer's own drive: the drive is looked up again first.

function diskpart(lines) {
  return new Promise((resolve) => {
    const file = path.join(require('os').tmpdir(), `pts-diskpart-${Date.now()}.txt`);
    fs.writeFileSync(file, lines.join('\r\n') + '\r\n', 'ascii');
    execFile('diskpart', ['/s', file], { windowsHide: true, timeout: 300000 }, (err, stdout) => {
      fs.unlink(file, () => {});
      resolve({ ok: !err, out: String(stdout || '') });
    });
  });
}

async function format(checksDir, { number, sizeBytes, fsType }) {
  if (process.platform !== 'win32') return { ok: false, error: 'Formatting from the app needs Windows. On a Mac use Disk Utility.' };
  const n = Number(number);
  const list = await listDrives(checksDir);
  const d = list.ok ? list.drives.find((x) => Number(x.number) === n) : null;
  if (!d || d.boot || Math.abs(Number(d.sizeBytes) - Number(sizeBytes)) > 1e6) {
    return { ok: false, error: 'Stopped for safety: couldn’t confirm that’s the drive being tested (or it’s this computer’s own drive). Nothing was changed.' };
  }
  const type = ['fat32', 'exfat', 'ntfs'].includes(fsType) ? fsType : 'exfat';
  const r = await diskpart([`select disk ${n}`, 'attributes disk clear readonly', 'clean', 'create partition primary', `format fs=${type} quick`, 'assign']);
  if (!r.ok) {
    return { ok: false, error: /write.?protect/i.test(r.out) ? 'The drive is write-protected (SD cards: check the lock switch on the side).' : 'Windows couldn’t format the drive.', details: r.out.slice(-800) };
  }
  return { ok: true, fsType: type.toUpperCase() };
}

function stop() {
  if (job) {
    job.stop = true;
  }
  return { ok: true };
}

module.exports = { listDrives, scan, speed, format, stop };
