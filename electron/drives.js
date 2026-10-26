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

// ---- Fake capacity check (SD cards and USB sticks) --------------------------
// Fills the free space with test files, reads every byte back, then deletes them.
// Fake cards claim more space than they have: data past their real size comes back wrong.
// Files already on the card are never touched.

const FILE_SIZE = 256 * MB;
const CHUNK = 8 * MB;
const UV_FS_O_DIRECT = 0x02000000; // read past Windows' memory cache, straight from the card

// Test data: every 4 KB block is different and depends on where it is, so data that has
// been moved, repeated or lost can't pass
function pattern(buf, globalOffset, seed) {
  const u = new Uint32Array(buf.buffer, buf.byteOffset, buf.length / 4);
  for (let i = 0; i < u.length; i += 1024) {
    let x = (((globalOffset / 4096) + i / 1024) * 2654435761 ^ seed) >>> 0 || 1;
    for (let j = 0; j < 1024; j++) {
      x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
      u[i + j] = x;
    }
  }
}

async function openForVerify(file) {
  if (process.platform === 'win32') {
    try {
      const fh = await fs.promises.open(file, UV_FS_O_DIRECT);
      const b = Buffer.alloc(CHUNK);
      await fh.read(b, 0, 4096, 0); // direct reads can be fussy: check it works
      return { fh, direct: true };
    } catch { /* fall back to a normal read */ }
  }
  return { fh: await fs.promises.open(file, 'r'), direct: false };
}

async function capacity(_checksDir, { volumes, limitBytes }, send) {
  const vol = (volumes || []).slice().sort((a, b) => (b.free || 0) - (a.free || 0))[0];
  if (!vol) return { ok: false, error: 'The card has no partition with a drive letter. Format it first, then test again.' };
  const root = /^[A-Z]$/i.test(vol.letter) ? vol.letter + ':\\' : vol.letter;
  const dir = path.join(root, 'PTS-capacity-check');
  const free = Math.max(0, Number(vol.free) - 16 * MB); // leave a little room
  const total = Math.min(limitBytes || Infinity, Math.floor(free / CHUNK) * CHUNK);
  if (total < CHUNK) return { ok: false, error: 'No free space on the card to test. Delete some files or format it.' };
  const seed = (Date.now() & 0x7fffffff) >>> 0;
  const cells = 600;
  const map = new Array(cells).fill('.');
  const markMap = (offset, len, v) => {
    for (let c = Math.floor((offset / total) * cells); c <= Math.min(cells - 1, Math.floor(((offset + len - 1) / total) * cells)); c++) {
      if (v === 'b' || map[c] !== 'b') map[c] = v;
    }
  };
  const res = { ok: true, phase: 'write', done: 0, total: total * 2, written: 0, verified: 0, badBytes: 0, firstBad: null, startedAt: Date.now() };
  job = { stop: false };
  const buf = Buffer.alloc(CHUNK);
  const want = Buffer.alloc(CHUNK);
  const files = [];
  let lastSend = 0;
  const progress = (force) => {
    const now = Date.now();
    if (!force && now - lastSend < 300) return;
    lastSend = now;
    const secs = (now - res.startedAt) / 1000;
    send({ ...res, map: map.join(''), speed: res.done / MB / Math.max(secs, 0.001), eta: secs > 3 && res.done ? ((res.total - res.done) / res.done) * secs : null });
  };
  try {
    await fs.promises.mkdir(dir, { recursive: true });
    // 1. Write
    let offset = 0;
    writing: while (offset < total) {
      const file = path.join(dir, `test-${String(files.length + 1).padStart(4, '0')}.bin`);
      const size = Math.min(FILE_SIZE, total - offset);
      const fh = await fs.promises.open(file, 'w');
      files.push({ file, offset, size });
      try {
        for (let o = 0; o < size; o += CHUNK) {
          if (job.stop) break writing;
          pattern(buf, offset + o, seed);
          try {
            await fh.write(buf, 0, CHUNK, o);
          } catch (err) {
            if (err.code === 'ENOSPC') { files[files.length - 1].size = o; res.note = 'The card ran out of space sooner than it said it would'; break writing; }
            throw err;
          }
          res.written += CHUNK; res.done += CHUNK;
          markMap(offset + o, CHUNK, 'w');
          progress();
        }
        await fh.sync();
      } finally {
        await fh.close().catch(() => {});
      }
      offset += size;
    }
    // 2. Read it all back and compare
    res.phase = 'verify';
    progress(true);
    for (const f of files) {
      if (job.stop) break;
      const { fh, direct } = await openForVerify(f.file);
      if (!direct) res.cached = true;
      try {
        for (let o = 0; o < f.size; o += CHUNK) {
          if (job.stop) break;
          pattern(want, f.offset + o, seed);
          let ok = false;
          try {
            const { bytesRead } = await fh.read(buf, 0, CHUNK, o);
            ok = bytesRead === CHUNK && buf.equals(want);
          } catch { ok = false; }
          if (!ok) { res.badBytes += CHUNK; if (res.firstBad == null) res.firstBad = f.offset + o; }
          res.verified += CHUNK; res.done += CHUNK;
          markMap(f.offset + o, CHUNK, ok ? 'g' : 'b');
          progress();
        }
      } finally {
        await fh.close().catch(() => {});
      }
    }
    if (job.stop) res.stopped = true;
  } catch (err) {
    res.ok = false;
    res.error = err.code === 'EACCES' || err.code === 'EPERM' ? 'The card is write-protected (check the lock switch on the side of SD cards).' : err.message;
  } finally {
    // 3. Tidy up: remove every test file
    for (const f of files) await fs.promises.unlink(f.file).catch(() => {});
    await fs.promises.rmdir(dir).catch(() => {});
    job = null;
  }
  res.realBytes = res.firstBad != null ? res.firstBad : res.written;
  const secs = (Date.now() - res.startedAt) / 1000;
  return { ...res, map: map.join(''), seconds: secs, speed: res.done / MB / Math.max(secs, 0.001) };
}

// ---- Quick fake capacity check (Windows) -----------------------------------
// Like the well-known fake-card tools: instead of filling the card, it checks 128 spots
// spread over the whole size the card claims. A fake card can't hold markers past its real
// size: they come back wrong, or turn up lower down (the card "wraps round").
// Windows won't let an app write directly to a card that has a mounted volume, so the card
// is WIPED first and FORMATTED again at the end (exFAT, or FAT32 for 32 GB and under).
// It only ever runs on a drive Windows reports as USB / SD, never this computer's own drive.

function diskpart(lines) {
  return new Promise((resolve) => {
    const file = path.join(require('os').tmpdir(), `pts-diskpart-${Date.now()}.txt`);
    fs.writeFileSync(file, lines.join('\r\n') + '\r\n', 'ascii');
    execFile('diskpart', ['/s', file], { windowsHide: true, timeout: 120000 }, (err, stdout) => {
      fs.unlink(file, () => {});
      resolve({ ok: !err, out: String(stdout || '') });
    });
  });
}

async function probe(checksDir, { number, sizeBytes }, send) {
  const testFile = process.env.PTS_RAW_TEST;
  if (process.platform !== 'win32' && !testFile) return { ok: false, error: 'The quick check needs Windows. Use the full check instead.' };
  const n = Number(number);
  const t0 = Date.now();

  // Safety first: look the drive up again and refuse anything that isn't a card / stick
  if (!testFile) {
    const list = await listDrives(checksDir);
    const d = list.ok ? list.drives.find((x) => Number(x.number) === n) : null;
    const cardBus = d && (/usb|^sd$|^mmc$/i.test(d.bus || '') || process.env.PTS_SELFTEST === '1');
    if (!d || d.boot || !cardBus || Math.abs(Number(d.sizeBytes) - Number(sizeBytes)) > 1e6) {
      return { ok: false, error: 'Stopped for safety: that drive doesn’t look like a removable card or stick, so it wasn’t touched.', details: JSON.stringify({ found: !!d, bus: d && d.bus, boot: d && d.boot, size: d && d.sizeBytes, asked: sizeBytes, selftest: process.env.PTS_SELFTEST || null }) };
    }
  }

  const SPOTS = 128;
  const BLOCK = 256 * 1024; // bigger than a card's own memory cache, so it can't fake the read-back
  const size = alignDown(Number(sizeBytes));
  if (size < SPOTS * BLOCK * 2) return { ok: false, error: 'The card is too small to test.' };
  const offsets = Array.from({ length: SPOTS }, (_, i) => alignDown(((size - BLOCK) * i) / (SPOTS - 1)));
  const seed = (Date.now() & 0x7fffffff) >>> 0;
  const map = new Array(SPOTS).fill('.');
  const tell = (phase, done) => send({ phase, done, total: SPOTS * 2 + 2, map: map.join('') });
  const res = { ok: true, spots: SPOTS, badSpots: 0, firstBad: null, lastGood: 0, wiped: false, formatted: false };
  job = { stop: false };

  // 1. Wipe
  tell('wipe', 0);
  if (!testFile) {
    const w = await diskpart([`select disk ${n}`, 'clean']);
    if (!w.ok) { job = null; return { ok: false, error: 'Windows wouldn’t wipe the card (is it write-protected? check the lock switch).', details: w.out.slice(-600) }; }
    res.wiped = true;
  }

  // First word of every 4 KB block of marker data -> where on the card it was written
  const whereFrom = new Map();
  const probeBuf = Buffer.alloc(4096);
  for (let j = 0; j < SPOTS; j++) {
    for (let q = 0; q < BLOCK; q += 4096) { pattern(probeBuf, offsets[j] + q, seed); whereFrom.set(probeBuf.readUInt32LE(0), offsets[j] + q); }
  }
  const marker = (i) => { const b = Buffer.alloc(BLOCK); pattern(b, offsets[i], seed); return b; };
  // Windows only accepts writes to a disk through the plain (non-promise) file calls,
  // so this uses those, pausing between spots to keep the app responsive
  const pause = () => new Promise((r) => setImmediate(r));
  let fd = null;
  try {
    const p = testFile || `\\\\.\\PhysicalDrive${n}`;
    try { fd = fs.openSync(p, 'r+'); } catch (err) { throw new Error(`couldn’t open the card (${errText(err)})`); }
    // 2. Marker at every spot, then make sure it has really reached the card
    for (let i = 0; i < SPOTS; i++) {
      await pause();
      fs.writeSync(fd, marker(i), 0, BLOCK, offsets[i]);
      map[i] = 'w';
      tell('write', i + 2);
    }
    fs.fsyncSync(fd);
    // 3. Read every marker back
    const got = Buffer.alloc(BLOCK);
    for (let i = 0; i < SPOTS; i++) {
      await pause();
      let ok = false;
      try { ok = fs.readSync(fd, got, 0, BLOCK, offsets[i]) === BLOCK && got.equals(marker(i)); } catch { ok = false; }
      if (!ok) {
        // Each 4 KB of marker data is unique to where it was written: if data meant for
        // further up turned up here, the card wraps round and its real size is the gap
        for (let k = 0; k < BLOCK; k += 4096 * 8) {
          const from = whereFrom.get(got.readUInt32LE(k));
          if (from != null && from > offsets[i] + k) res.wrap = Math.min(res.wrap || Infinity, from - (offsets[i] + k));
        }
        res.badSpots++;
        if (res.firstBad == null) res.firstBad = offsets[i];
      } else if (res.firstBad == null) res.lastGood = offsets[i] + BLOCK;
      map[i] = ok ? 'g' : 'b';
      tell('check', SPOTS + i + 2);
    }
    // 4. Most fakes ignore the top address bits, so data written high up really lands lower
    //    down by a power of two. Read those lower places to see if a marker turned up there.
    const small = Buffer.alloc(4096);
    for (let period = 16 * MB; period < size; period *= 2) {
      await pause();
      for (let j = 0; j < SPOTS; j++) {
        const pos = offsets[j] + 4096 - period;
        if (pos < 0) continue;
        try {
          fs.readSync(fd, small, 0, 4096, pos);
          if (whereFrom.get(small.readUInt32LE(0)) === offsets[j] + 4096) {
            res.wrap = Math.min(res.wrap || Infinity, period);
            if (map[j] !== 'b') { map[j] = 'b'; res.badSpots++; if (res.firstBad == null || offsets[j] < res.firstBad) res.firstBad = offsets[j]; }
          }
        } catch { /* unreadable: the scan covers that */ }
      }
    }
  } catch (err) {
    res.ok = false;
    res.error = `The quick check couldn’t finish: ${err.message || errText(err)}.`;
  } finally {
    if (fd != null) { try { fs.closeSync(fd); } catch { /* ignore */ } }
    job = null;
  }

  // 4. Format it again so it's ready to use
  if (!testFile) {
    tell('format', SPOTS * 2 + 1);
    const fsType = size <= 32 * 1e9 ? 'fat32' : 'exfat';
    const f = await diskpart([`select disk ${n}`, 'clean', 'create partition primary', `format fs=${fsType} quick`, 'assign']);
    res.formatted = f.ok;
    res.fsType = fsType.toUpperCase();
    if (!f.ok) { res.warning = 'The card couldn’t be formatted again. Format it in Windows before it’s sold.'; res.details = f.out.slice(-600); }
  }
  res.realBytes = res.wrap ? res.wrap : res.firstBad != null ? res.lastGood : size;
  delete res.wrap;
  res.map = map.join('');
  res.seconds = (Date.now() - t0) / 1000;
  return res;
}

function stop() {
  if (job) {
    job.stop = true;
  }
  return { ok: true };
}

module.exports = { listDrives, scan, speed, capacity, probe, stop };
