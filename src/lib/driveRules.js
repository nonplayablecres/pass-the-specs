// Rules for the drive tester: what counts as healthy, and how fast a drive should be.
// Edit the numbers here.

export const DRIVE_SETTINGS = {
  wearFail: 90, // % of the drive's life used up
  wearWarn: 70,
  tempWarn: 65, // °C
  readPass: 0.7, // must reach this share of its rated read speed
  writePass: 0.5, // writes vary more (cache, how full it is), so a lower bar
  // NVMe drives are rated with dozens of reads at once, which this test doesn't do,
  // so they get a lower bar
  nvmeReadPass: 0.4,
  nvmeWritePass: 0.3
};

// Rated sequential read / write in MB/s for common drives.
// "match" is looked for in the drive's name (lower case, spaces removed). More specific first.
export const RATED = [
  ['990pro', 7450, 6900, 'Samsung 990 PRO'], ['990evo', 5000, 4200, 'Samsung 990 EVO'], ['980pro', 7000, 5000, 'Samsung 980 PRO'],
  ['970evoplus', 3500, 3300, 'Samsung 970 EVO Plus'], ['970evo', 3400, 2500, 'Samsung 970 EVO'], ['970pro', 3500, 2700, 'Samsung 970 PRO'],
  ['ssd980', 3500, 3000, 'Samsung 980'], ['960pro', 3500, 2100, 'Samsung 960 PRO'], ['960evo', 3200, 1900, 'Samsung 960 EVO'],
  ['pm9a1', 7000, 5200, 'Samsung PM9A1'], ['pm981', 3500, 2400, 'Samsung PM981'], ['870evo', 560, 530, 'Samsung 870 EVO'],
  ['870qvo', 560, 530, 'Samsung 870 QVO'], ['860evo', 550, 520, 'Samsung 860 EVO'], ['860qvo', 550, 520, 'Samsung 860 QVO'], ['850evo', 540, 520, 'Samsung 850 EVO'],
  ['sn850x', 7300, 6600, 'WD Black SN850X'], ['sn850', 7000, 5300, 'WD Black SN850'], ['sn770', 5150, 4900, 'WD Black SN770'],
  ['sn580', 4150, 4150, 'WD Blue SN580'], ['sn750', 3470, 3000, 'WD Black SN750'], ['sn730', 3400, 3100, 'WD SN730'],
  ['sn570', 3500, 3000, 'WD Blue SN570'], ['sn550', 2400, 1950, 'WD Blue SN550'], ['sn530', 2400, 1950, 'WD SN530'], ['sa510', 560, 530, 'WD Blue SA510'],
  ['t700ssd', 12400, 11800, 'Crucial T700'], ['t500ssd', 7400, 7000, 'Crucial T500'], ['p5pssd', 6600, 5000, 'Crucial P5 Plus'], ['p5ssd', 3400, 3000, 'Crucial P5'],
  ['p3pssd', 5000, 4200, 'Crucial P3 Plus'], ['p3ssd', 3500, 3000, 'Crucial P3'], ['p2ssd', 2400, 1900, 'Crucial P2'], ['p1ssd', 2000, 1700, 'Crucial P1'],
  ['mx500', 560, 510, 'Crucial MX500'], ['bx500', 540, 500, 'Crucial BX500'],
  ['skc3000', 7000, 7000, 'Kingston KC3000'], ['sfyr', 7300, 7000, 'Kingston Fury Renegade'], ['snv2s', 3500, 2800, 'Kingston NV2'], ['snv3s', 6000, 5000, 'Kingston NV3'],
  ['snvs', 2100, 1700, 'Kingston NV1'], ['skc2500', 3500, 2900, 'Kingston KC2500'], ['sa2000', 2200, 2000, 'Kingston A2000'], ['sa400', 500, 450, 'Kingston A400'],
  ['shpp41', 7000, 6500, 'SK hynix P41'], ['shgp31', 3500, 3200, 'SK hynix P31'], ['nm790', 7400, 6500, 'Lexar NM790'],
  ['ssdpeknw', 1800, 1800, 'Intel 660p'], ['ssdpeknu', 3500, 2500, 'Intel 670p'], ['mp600pro', 7000, 6550, 'Corsair MP600 PRO'], ['firecuda530', 7300, 6900, 'Seagate FireCuda 530']
];

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

export const sizeLabel = (bytes) => {
  const gb = bytes / 1e9;
  if (gb >= 900) return `${Math.round((gb / 1000) * 2) / 2}TB`.replace('.0TB', 'TB');
  const sizes = [16, 32, 60, 64, 120, 128, 240, 250, 256, 480, 500, 512, 750];
  return `${sizes.reduce((b, v) => (Math.abs(v - gb) < Math.abs(b - gb) ? v : b), sizes[0])}GB`;
};

// What kind of drive this is and how fast it should be
export function expectedSpeed(d) {
  const name = norm(d.model);
  const known = RATED.find(([m]) => name.includes(m));
  const usb = /usb/i.test(d.bus || '');
  const hdd = /hdd/i.test(d.media || '') || (d.spindle && d.spindle > 0);
  const nvme = /nvme|pci/i.test(d.bus || '');
  let kind;
  let read;
  let write;
  if (known) { kind = known[3]; read = known[1]; write = known[2]; }
  else if (hdd) { kind = `Hard drive${d.spindle > 1 ? ` (${d.spindle} rpm)` : ''}`; read = d.spindle && d.spindle < 7000 ? 100 : 150; write = read; }
  else if (nvme) { kind = 'NVMe SSD'; read = 1800; write = 1200; }
  else { kind = 'SATA SSD'; read = 500; write = 450; }
  // A USB adapter caps the speed, so the drive can't show its real numbers
  const cap = usb ? 400 : null;
  return { kind, read, write, rated: !!known, usb, cap, hdd, type: hdd ? 'HDD' : nvme ? 'M.2 NVMe SSD' : 'SSD' };
}

// Health from the drive's own report
export function judgeHealth(d) {
  const S = DRIVE_SETTINGS;
  const bad = [];
  const warn = [];
  const info = [];
  const raw = (id) => (d.smart && d.smart[id] ? Number(d.smart[id].raw) : null);
  if (/unhealthy/i.test(d.health)) bad.push('Drive reports itself as failing');
  else if (/warning/i.test(d.health)) bad.push('Drive reports a health warning');
  if (d.predictFail) bad.push('Drive predicts it will fail soon (SMART)');
  if (d.smartStatus === 'Failing') bad.push('SMART status: failing');
  const realloc = raw(5);
  const pending = raw(197);
  const uncorrect = raw(198);
  const reported = raw(187);
  if (realloc > 0) bad.push(`${realloc} bad sectors already replaced (reallocated)`);
  if (pending > 0) bad.push(`${pending} sectors waiting to be replaced (pending)`);
  if (uncorrect > 0) bad.push(`${uncorrect} unreadable sectors (uncorrectable)`);
  if (reported > 0) bad.push(`${reported} read errors reported`);
  if (d.readErrors > 0) bad.push(`${d.readErrors} uncorrected read errors`);
  if (d.writeErrors > 0) bad.push(`${d.writeErrors} uncorrected write errors`);
  if (d.wear != null) {
    if (d.wear >= S.wearFail) bad.push(`${d.wear}% of its life used`);
    else if (d.wear >= S.wearWarn) warn.push(`${d.wear}% of its life used`);
    else info.push(`${d.wear}% of its life used`);
  }
  if (d.temp != null && d.temp > 0) (d.temp >= S.tempWarn ? warn : info).push(`${d.temp}°C`);
  const hours = d.hours != null ? d.hours : raw(9);
  if (hours != null) info.push(`${Number(hours).toLocaleString()} hours powered on`);
  const known = d.health && d.health !== 'Unknown';
  return { status: bad.length ? 'fail' : known || d.smart && Object.keys(d.smart).length ? 'pass' : 'unknown', bad, warn, info };
}

// Speed vs what it should do
export function judgeSpeed(d, res) {
  const S = DRIVE_SETTINGS;
  const e = expectedSpeed(d);
  const wantRead = e.cap ? Math.min(e.read, e.cap) : e.read;
  const wantWrite = e.cap ? Math.min(e.write, e.cap) : e.write;
  const nvme = /nvme/i.test(e.type) && !e.usb;
  const readOk = res.read == null ? null : res.read >= wantRead * (nvme ? S.nvmeReadPass : S.readPass);
  const writeOk = res.write == null ? null : res.write >= wantWrite * (nvme ? S.nvmeWritePass : S.writePass);
  const tested = [readOk, writeOk].filter((x) => x !== null);
  return { e, wantRead, wantWrite, readOk, writeOk, status: !tested.length ? 'unknown' : tested.every(Boolean) ? 'pass' : 'fail' };
}

// Model name for the CeX listing search
export function driveModel(d) {
  const words = String(d.model || '').replace(/\b(ssd|nvme|ata|scsi|disk|device|usb|series)\b/gi, ' ').replace(/\s+/g, ' ').trim();
  const size = sizeLabel(d.sizeBytes);
  return words.toLowerCase().includes(size.toLowerCase()) ? words : `${words} ${size}`;
}
