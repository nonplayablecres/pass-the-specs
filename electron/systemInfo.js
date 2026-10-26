// Reads hardware and security info from the machine being tested.
// Windows: runs checks/windows.ps1 (lives with the screens, so it auto-updates).
// Mac: runs a few built-in macOS commands.

const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

function run(cmd, args, timeout = 60000) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout, maxBuffer: 20 * 1024 * 1024, windowsHide: true }, (err, stdout) => {
      resolve(err && !stdout ? '' : String(stdout));
    });
  });
}

async function runScript(checksDir, name, timeout) {
  // Copy the script out first: PowerShell can't read files packed inside the exe.
  const source = fs.readFileSync(path.join(checksDir, name), 'utf8');
  const temp = path.join(os.tmpdir(), 'pts-' + name);
  fs.writeFileSync(temp, source, 'utf8');
  const out = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', temp], timeout);
  const start = out.indexOf('{');
  if (start === -1) throw new Error('Scan returned nothing');
  return JSON.parse(out.slice(start));
}

async function windowsInfo(checksDir) {
  return runScript(checksDir, 'windows.ps1', 120000);
}

// Live check used by the Ports and Memory card tests (Windows only for now)
async function getPorts(checksDir) {
  if (process.platform === 'darwin') {
    try { return { ok: true, ports: await macPorts() }; } catch (err) { return { ok: false, error: err.message }; }
  }
  if (process.platform !== 'win32') return { ok: false, error: 'Live port check isn’t available on this system' };
  try {
    return { ok: true, ports: await runScript(checksDir, 'ports.ps1', 15000) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// Built-in Mac screens, by resolution -> size in inches
const MAC_SCREENS = {
  '2304x1440': 12, '2560x1600': 13.3, '2560x1664': 13.6, '2880x1864': 15.3, '2880x1800': 15.4,
  '3024x1964': 14.2, '3456x2234': 16.2, '3072x1920': 16
};

function flatten(items, out = []) {
  for (const it of items || []) {
    out.push(it);
    if (it._items) flatten(it._items, out);
  }
  return out;
}

async function macProfile(types) {
  const raw = await run('system_profiler', ['-json', ...types], 90000);
  try { return JSON.parse(raw); } catch { return {}; }
}

async function macInfo() {
  const sp = await macProfile(['SPHardwareDataType', 'SPPowerDataType', 'SPStorageDataType', 'SPBluetoothDataType', 'SPAirPortDataType', 'SPCameraDataType', 'SPDisplaysDataType', 'SPCardReaderDataType']);
  const hw = (sp.SPHardwareDataType || [])[0] || {};
  const power = sp.SPPowerDataType || [];
  const batt = power.find((p) => p.sppower_battery_health_info) || null;
  const health = batt ? batt.sppower_battery_health_info : {};
  const fv = await run('fdesetup', ['status']);
  const mdm = await run('profiles', ['status', '-type', 'enrollment']);
  const ver = await run('sw_vers', ['-productVersion']);
  const users = (await run('dscl', ['.', '-list', '/Users', 'UniqueID']))
    .split('\n').map((l) => l.trim().split(/\s+/)).filter((p) => p.length === 2 && Number(p[1]) >= 501).map((p) => p[0]);
  const ramGB = parseInt(String(hw.physical_memory || '').replace(/[^0-9]/g, ''), 10) || null;

  // Whole internal drive size (not just the volume), e.g. a "512GB" Apple SSD is 500.3GB
  const diskInfo = await run('diskutil', ['info', 'disk0']);
  const diskBytes = Number((diskInfo.match(/Disk Size:.*?\((\d+) Bytes\)/) || [])[1]) || 0;
  const root = (sp.SPStorageDataType || []).find((d) => d.mount_point === '/') || {};
  const pd = root.physical_drive || {};
  const disks = [{
    name: pd.device_name || root._name || 'Internal SSD',
    sizeGB: Math.round((diskBytes || root.size_in_bytes || 0) / 1e9),
    type: pd.medium_type === 'rotational' ? 'HDD' : 'SSD',
    health: pd.smart_status === 'Verified' || !pd.smart_status ? 'Healthy' : pd.smart_status
  }];

  // Chip and core counts: "M5 (10-CPU 10-GPU)"
  const cpuCores = parseInt(String(hw.number_processors || '').replace(/^proc\s*/, ''), 10) || null;
  const gpu = (sp.SPDisplaysDataType || []).find((d) => d.sppci_cores) || {};
  const gpuCores = parseInt(gpu.sppci_cores, 10) || null;

  // Built-in screen size
  const displays = flatten(sp.SPDisplaysDataType).filter((d) => d._spdisplays_pixels || d.spdisplays_pixelresolution);
  const internal = displays.find((d) => /internal|built-?in/i.test(`${d.spdisplays_connection_type || ''} ${d.spdisplays_display_type || ''}`)) || null;
  const px = internal ? String(internal._spdisplays_pixels || internal.spdisplays_pixelresolution || '').replace(/[^0-9x]/gi, '').toLowerCase() : '';
  const screenInches = MAC_SCREENS[px] || null;

  // WiFi: connected if the WiFi interface has an IP address
  const airport = (sp.SPAirPortDataType || [])[0] || {};
  const iface = (airport.spairport_airport_interfaces || [])[0] || {};
  const ifName = iface._name || 'en0';
  const ip = (await run('ipconfig', ['getifaddr', ifName])).trim();
  const wifiUp = !!ip || iface.spairport_status_information === 'spairport_status_connected';

  const maxCap = parseInt(String(health.sppower_battery_health_maximum_capacity || '').replace(/[^0-9]/g, ''), 10);
  const lock = String(hw.activation_lock_status || '');
  const laptop = /book/i.test(hw.machine_name || '');

  return {
    platform: 'mac',
    manufacturer: 'Apple',
    machineName: hw.machine_name || 'Mac',
    identifier: hw.machine_model || '',
    model: [hw.machine_name, hw.machine_model].filter(Boolean).join(' '),
    chassis: laptop ? 'laptop' : 'desktop',
    gpus: [],
    serial: hw.serial_number || null,
    os: { name: 'macOS ' + ver.trim(), version: ver.trim() },
    cpu: hw.chip_type || hw.cpu_type || null,
    cpuCores,
    gpuCores,
    ramGB,
    disks,
    screenInches,
    encryption: { state: /FileVault is On/i.test(fv) ? 'on' : /FileVault is Off/i.test(fv) ? 'off' : 'unknown', detail: fv.trim() },
    management: {
      known: !!mdm,
      mdm: /MDM enrollment: Yes/i.test(mdm),
      dep: /Enrolled via DEP: Yes/i.test(mdm)
    },
    findMy: { known: !!lock, on: /enabled/i.test(lock) && !/disabled/i.test(lock) },
    battery: batt ? { present: true, healthPct: Number.isFinite(maxCap) ? maxCap : null, cycles: health.sppower_battery_cycle_count || null, condition: health.sppower_battery_health || null } : { present: false },
    wifi: { present: (sp.SPAirPortDataType || []).length > 0, up: wifiUp },
    bluetooth: { present: (sp.SPBluetoothDataType || []).length > 0 },
    cameras: (sp.SPCameraDataType || []).length,
    touch: false,
    fingerprint: laptop, // every Apple-silicon MacBook has Touch ID
    optical: false,
    cardReader: (sp.SPCardReaderDataType || []).length > 0,
    profiles: users
  };
}

// Live port check on a Mac: USB devices, SD card, wired network
async function macPorts() {
  const sp = await macProfile(['SPUSBDataType', 'SPUSBHostDataType', 'SPCardReaderDataType']);
  const usbItems = flatten([...(sp.SPUSBDataType || []), ...(sp.SPUSBHostDataType || [])]);
  const usb = usbItems
    .map((it) => {
      const locKey = Object.keys(it).find((k) => /location/i.test(k));
      return { id: `${it._name}-${locKey ? it[locKey] : ''}`, name: it._name || 'USB device', port: locKey ? String(it[locKey]).split(' ')[0] : null };
    })
    .filter((u) => u.port && !/hub|bus|controller/i.test(u.name));
  const readers = sp.SPCardReaderDataType || [];
  const media = flatten(readers).filter((r) => !readers.includes(r));
  const card = media[0];
  const eth = (await run('networksetup', ['-listallhardwareports'])).includes('Ethernet');
  return {
    usb,
    card: { present: !!card, name: card ? card._name || 'SD card' : '' },
    ethernet: { present: eth, up: false }
  };
}

async function getSystemInfo(checksDir) {
  try {
    if (process.platform === 'win32') return { ok: true, info: await windowsInfo(checksDir) };
    if (process.platform === 'darwin') return { ok: true, info: await macInfo() };
    return { ok: false, error: 'This system type is not supported yet.' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = { getSystemInfo, getPorts, run };
