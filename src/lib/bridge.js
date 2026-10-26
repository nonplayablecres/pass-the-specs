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

export const bridge = {
  inShell: hasShell,
  async systemInfo() {
    if (hasShell) return window.pts.systemInfo();
    await new Promise((r) => setTimeout(r, 700));
    const q = window.location.search;
    return { ok: true, info: /custom/.test(q) ? MOCK_CUSTOM : /asus/.test(q) ? MOCK_ASUS : MOCK, mock: true };
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
    // add ?near or ?none to the preview address to see the price-request cases
    const q = window.location.search;
    const hits = /custom/i.test(query) ? custom : /none/.test(q) ? [] : /near/.test(q) ? dell.filter((d) => !d.boxName.includes('/8GB')) : dell;
    return { ok: true, hits, mock: true };
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
  openUrl(url) { return hasShell ? window.pts.openUrl(url) : window.open(url, '_blank'); },
  reload() { return hasShell ? window.pts.reload() : window.location.reload(); },
  openRelease(url) { return hasShell ? window.pts.openRelease(url) : window.open(url, '_blank'); },
  onUpdate(fn) { return hasShell ? window.pts.onUpdate(fn) : () => {}; }
};
