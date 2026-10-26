// Talks to the desktop shell (Electron). When you run the screens in a normal
// browser with "npm run dev:web", it falls back to example data so you can
// still click through everything.

const MOCK = {
  platform: 'windows',
  manufacturer: 'Dell Inc.',
  model: 'Latitude 5420',
  productVersion: '',
  chassis: 'laptop',
  screenInches: 14,
  gpus: [{ name: 'Intel(R) Iris(R) Xe Graphics', vramGB: 1 }],
  serial: 'ABC1234',
  os: { name: 'Microsoft Windows 11 Pro', version: '10.0.22631', build: '22631' },
  cpu: '11th Gen Intel(R) Core(TM) i5-1145G7 @ 2.60GHz',
  ramGB: 8,
  disks: [{ name: 'KXG60ZNV256G', sizeGB: 256, type: 'SSD', bus: 'NVMe', health: 'Healthy', wear: 4 }],
  encryption: { state: 'on', detail: 'BitLocker on' },
  management: { known: true, azureAd: false, enterprise: false, domain: false, mdm: [] },
  activation: { known: true, activated: true },
  firmwareKey: true,
  tpm: { present: true, version: '2.0' },
  secureBoot: true,
  battery: { present: true, healthPct: 71, cycles: 412, charging: true, pluggedIn: true },
  wifi: { present: true, up: true },
  bluetooth: { present: true },
  touch: false,
  fingerprint: true,
  optical: false,
  cardReader: true,
  cameras: 1,
  profiles: ['Store'],
  biosPassword: { known: true, set: false, source: 'Dell', detail: '' },
  stability: { unexpectedShutdowns: 0, bluescreens: 0, appHangs: 2, uptimeHours: 3.2 }
};

// Open the browser preview with ?asus to see a gaming laptop
const MOCK_ASUS = {
  ...MOCK,
  manufacturer: 'ASUSTeK COMPUTER INC.',
  model: 'ROG Strix G18 G814FP_G814FP',
  screenInches: 18,
  maxRefresh: 240,
  cpu: 'AMD Ryzen 9 9955HX 16-Core Processor',
  ramGB: 32,
  ramType: 'DDR5',
  disks: [{ name: 'Micron 2400 1TB', sizeGB: 1000, type: 'SSD', bus: 'NVMe', health: 'Healthy', wear: 1 }],
  gpus: [{ name: 'AMD Radeon(TM) 610M', vramGB: 1 }, { name: 'NVIDIA GeForce RTX 5070 Laptop GPU', vramGB: 8 }],
  encryption: { state: 'off', detail: 'BitLocker off' }
};

// ?mac in the preview address shows a MacBook
const MOCK_MAC = {
  ...MOCK, platform: 'mac', manufacturer: 'Apple', machineName: 'MacBook Pro', identifier: 'Mac17,2', model: 'MacBook Pro Mac17,2',
  cpu: 'Apple M5', cpuCores: 10, gpuCores: 10, ramGB: 16, screenInches: 14.2, gpus: [],
  disks: [{ name: 'APPLE SSD', sizeGB: 500, type: 'SSD', health: 'Healthy' }], os: { name: 'macOS 26.1', version: '26.1' },
  encryption: { state: 'off', detail: 'FileVault is Off.' }, management: { known: true, mdm: false, dep: false },
  findMy: { known: true, on: false }, battery: { present: true, healthPct: 100, cycles: 12 }, fingerprint: true, cardReader: true, biosPassword: undefined
};

// Open the browser preview with ?custom on the end to see a custom-built desktop
const MOCK_CUSTOM = {
  ...MOCK,
  manufacturer: 'Micro-Star International Co., Ltd.',
  model: 'MS-7C02',
  chassis: 'desktop',
  screenInches: null,
  cpu: 'AMD Ryzen 7 5700X3D 8-Core Processor',
  ramGB: 32,
  ramType: 'DDR4',
  disks: [{ name: 'Samsung SSD 990 PRO 2TB', sizeGB: 2000, type: 'SSD', bus: 'NVMe', health: 'Healthy', wear: 2 }],
  gpus: [{ name: 'NVIDIA GeForce RTX 4060 Ti', vramGB: 8 }],
  encryption: { state: 'off', detail: 'BitLocker off' },
  battery: { present: false },
  fingerprint: false,
  cameras: 0
};

let mockPoll = 0;
const hasShell = typeof window !== 'undefined' && !!window.pts;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let mockStop = false;
const mockProgress = new Set();
const MOCK_DRIVES = [
  { number: 3, model: 'Generic- SD/MMC', media: 'Unspecified', bus: 'USB', sizeBytes: 63864569856, health: 'Unknown', boot: false, smart: {}, volumes: [{ letter: 'G', label: 'CARD', fs: 'exFAT', size: 63850000000, free: 63000000000 }] },
  { number: 0, model: 'KXG60ZNV256G NVMe TOSHIBA 256GB', media: 'SSD', bus: 'NVMe', sizeBytes: 256060514304, health: 'Healthy', boot: true, volumes: [], smart: {} },
  { number: 1, model: 'Samsung SSD 970 EVO Plus 1TB', serial: 'S4EWNX0R123456', media: 'SSD', bus: 'NVMe', sizeBytes: 1000204886016, health: 'Healthy', boot: false, temp: 38, wear: 3, hours: 4120, readErrors: 0, writeErrors: 0, predictFail: false, smart: {}, volumes: [{ letter: 'E', label: 'Data', fs: 'NTFS', size: 1000202833920, free: 812345678901 }] },
  { number: 2, model: 'ST1000DM010-2EP102', serial: 'Z9A1B2C3', media: 'HDD', bus: 'SATA', spindle: 7200, sizeBytes: 1000204886016, health: 'Healthy', boot: false, temp: 34, wear: null, hours: 21877, readErrors: 0, writeErrors: 0, predictFail: false, smart: { 5: { raw: 8 }, 197: { raw: 0 }, 198: { raw: 0 }, 9: { raw: 21877 } }, volumes: [{ letter: 'F', label: '', fs: 'NTFS', size: 1000202833920, free: 999000000000 }] }
];

export const bridge = {
  inShell: hasShell,
  async systemInfo() {
    if (hasShell) return window.pts.systemInfo();
    await new Promise((r) => setTimeout(r, 700));
    const q = window.location.search;
    return { ok: true, info: /custom/.test(q) ? MOCK_CUSTOM : /asus/.test(q) ? MOCK_ASUS : /mac/.test(q) ? MOCK_MAC : MOCK, mock: true };
  },
  async appInfo() {
    if (hasShell) return window.pts.appInfo();
    return { uiVersion: __APP_VERSION__, shellVersion: 'browser', platform: 'browser' };
  },
  async copy(text) {
    if (hasShell) return window.pts.copy(text);
    try { await navigator.clipboard.writeText(text); } catch { /* ignore */ }
    return true;
  },
  async ports() {
    if (hasShell) return window.pts.ports();
    // Example: a USB device appears after a few polls, then a memory card
    mockPoll += 1;
    const usb = [{ id: 'USB\\VID_1', name: 'Integrated Webcam', port: 'Port_#0005.Hub_#0001' }];
    if (mockPoll > 2) usb.push({ id: 'USB\\VID_2', name: 'USB Mass Storage', port: 'Port_#0001.Hub_#0001' });
    if (mockPoll > 4) usb.push({ id: 'USB\\VID_3', name: 'USB Mouse', port: 'Port_#0002.Hub_#0001' });
    return { ok: true, displays: mockPoll > 3 ? 2 : 1, ports: { usb, card: { present: mockPoll > 3, name: 'SD Card 32GB' }, ethernet: { present: true, up: false } } };
  },
  async cexSearch(query) {
    if (hasShell) return window.pts.cexSearch(query);
    await new Promise((r) => setTimeout(r, 600));
    // Example results for the browser preview
    const dell = [['8GB', '256GB', 'A', 380], ['8GB', '256GB', 'B', 340], ['8GB', '256GB', 'C', 300], ['16GB', '256GB', 'B', 400], ['16GB', '512GB', 'B', 440]]
      .map(([ram, ssd, g, sell]) => ({ boxId: `SLAPDELLAT5420${ram === '8GB' ? '8' : '16'}${ssd === '256GB' ? '25' : '51'}${g}`, boxName: `Dell Latitude 5420/i5-1145G7/${ram} Ram/${ssd} SSD/14"/W11/${g}`, category: 'Laptops - Windows', sell, cash: Math.round(sell * 0.45), exchange: Math.round(sell * 0.6) }));
    const custom = [{ boxId: 'SDESCUSR75700X3D322TB4060TIB', boxName: 'Custom/Ryzen 7 5700X3D/32GB DDR4/2TB SSD/RTX 4060 Ti/W11/B', category: 'Desktops - Custom', sell: 750, cash: 340, exchange: 450 }];
    const mac = [['SB', 'A', 1400], ['SB', 'B', 1300], ['Silver', 'B', 1290]].map(([c, g, sell], i) => ({ boxId: `SLAPAPPMBP172M5${i}${g}`, boxName: `MacBook Pro 17,2/M5 (10-CPU 10-GPU)/16GB Ram/512GB SSD/14"/${c}/${g}`, category: 'Apple Laptops', sell, cash: Math.round(sell * 0.45), exchange: Math.round(sell * 0.6) }));
    if (/macbook/i.test(query)) return { ok: true, hits: mac, mock: true };
    // add ?near or ?none to the preview address to see the price-request cases
    const q = window.location.search;
    const hits = /custom/i.test(query) ? custom : /none/.test(q) ? [] : /near/.test(q) ? dell.filter((d) => !d.boxName.includes('/8GB')) : dell;
    return { ok: true, hits, mock: true };
  },
  // 'granted' | 'denied' | 'restricted' | 'unknown' (older app copies: always 'unknown')
  async mediaAccess(kind) {
    if (hasShell && window.pts.mediaAccess) return window.pts.mediaAccess(kind);
    return { status: 'unknown' };
  },
  async touchId(action) {
    if (hasShell && window.pts.touchId) return window.pts.touchId(action);
    return { ok: false, supported: false };
  },
  async batteryReport(name) {
    if (hasShell && window.pts.batteryReport) return window.pts.batteryReport(name);
    return { ok: false };
  },
  async saveReport(name, text) {
    if (hasShell) return window.pts.saveReport(name, text);
    return { ok: false, error: 'Saving only works in the app' };
  },
  async factoryReset() {
    if (hasShell) return window.pts.factoryReset();
    window.alert('In the real app this opens the Windows "Reset this PC" screen.');
    return { ok: true };
  },
  // Drive tester. hasDrives = false on older app copies (needs the new exe / Mac app).
  get hasDrives() { return !hasShell || !!window.pts.drives; },
  async drives() {
    if (hasShell) return window.pts.drives ? window.pts.drives() : { ok: false, error: 'old-app' };
    await wait(600);
    return { ok: true, mock: true, drives: MOCK_DRIVES };
  },
  async driveScan(opts) {
    if (hasShell) return window.pts.driveScan(opts);
    // Pretend scan for the browser preview
    mockStop = false;
    const total = opts.mode === 'full' ? 4000 : 2300;
    const res = { mode: opts.mode, done: 0, total: total * 1048576, badBytes: 0, badSpots: [], slow: 0, blocks: 0, startedAt: Date.now() };
    for (let i = 1; i <= 20 && !mockStop; i++) {
      await wait(150);
      res.done = (res.total * i) / 20; res.blocks = Math.round((total * i) / 20);
      if (i === 12 && opts.number === 2) { res.badBytes = 196608; res.badSpots = [81234]; res.slow = 3; }
      const filled = Math.round((600 * i) / 20);
      res.map = Array.from({ length: 600 }, (_, c) => (c >= filled ? '.' : opts.number === 2 && c === 290 ? 'b' : opts.number === 2 && (c === 120 || c === 121 || c === 455) ? 's' : 'g')).join('');
      mockProgress.forEach((fn) => fn({ ...res, speed: 1850, eta: (20 - i) * 0.15 }));
    }
    return { ok: true, ...res, stopped: mockStop, speed: 1850, seconds: 3 };
  },
  async driveSpeed(opts) {
    if (hasShell) return window.pts.driveSpeed(opts);
    mockProgress.forEach((fn) => fn({ phase: 'read' }));
    await wait(1200);
    mockProgress.forEach((fn) => fn({ phase: 'write' }));
    await wait(900);
    return opts.number === 3 ? { ok: true, read: 88.4, write: 41.7, notes: [] } : opts.number === 2 ? { ok: true, read: 141.2, write: 128.4, notes: [] } : { ok: true, read: 3290.5, write: 2810.2, notes: [] };
  },
  async driveCapacity(opts) {
    if (hasShell) return window.pts.driveCapacity ? window.pts.driveCapacity(opts) : { ok: false, error: 'Needs the newest app' };
    mockStop = false;
    const total = 16 * 1e9;
    const res = { ok: true, phase: 'write', done: 0, total: total * 2, written: 0, verified: 0, badBytes: 0, firstBad: null };
    for (let i = 1; i <= 30 && !mockStop; i++) {
      await wait(120);
      const writing = i <= 15;
      res.phase = writing ? 'write' : 'verify';
      res.done = (res.total * i) / 30;
      res.written = Math.min(total, res.done);
      const fill = writing ? Math.round((600 * i) / 15) : 600;
      const checked = writing ? 0 : Math.round((600 * (i - 15)) / 15);
      res.map = Array.from({ length: 600 }, (_, c) => (c < checked ? (opts.fake && c > 150 ? 'b' : 'g') : c < fill ? 'w' : '.')).join('');
      mockProgress.forEach((fn) => fn({ ...res, speed: 42, eta: (30 - i) * 0.12 }));
    }
    if (opts.fake) { res.badBytes = 12e9; res.firstBad = 4e9; }
    return { ...res, realBytes: res.firstBad != null ? res.firstBad : res.written, stopped: mockStop, speed: 42 };
  },
  async driveStop() { if (hasShell) return window.pts.driveStop(); mockStop = true; return { ok: true }; },
  onDriveProgress(fn) {
    if (hasShell) return window.pts.onDriveProgress ? window.pts.onDriveProgress(fn) : () => {};
    mockProgress.add(fn);
    return () => mockProgress.delete(fn);
  },
  openUrl(url) { return hasShell ? window.pts.openUrl(url) : window.open(url, '_blank'); },
  reload() { return hasShell ? window.pts.reload() : window.location.reload(); },
  openRelease(url) { return hasShell ? window.pts.openRelease(url) : window.open(url, '_blank'); },
  onUpdate(fn) { return hasShell ? window.pts.onUpdate(fn) : () => {}; }
};
