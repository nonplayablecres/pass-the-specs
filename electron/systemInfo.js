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
  if (process.platform !== 'win32') return { ok: false, error: 'Live port check is Windows only for now' };
  try {
    return { ok: true, ports: await runScript(checksDir, 'ports.ps1', 15000) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function macInfo() {
  const raw = await run('system_profiler', ['-json', 'SPHardwareDataType', 'SPPowerDataType', 'SPStorageDataType', 'SPBluetoothDataType', 'SPAirPortDataType', 'SPCameraDataType']);
  let sp = {};
  try { sp = JSON.parse(raw); } catch { /* keep empty */ }
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
  const disks = (sp.SPStorageDataType || []).filter((d) => d.mount_point === '/').map((d) => ({
    name: d.physical_drive ? d.physical_drive.device_name : d._name,
    sizeGB: Math.round((d.size_in_bytes || 0) / 1e9),
    type: d.physical_drive && d.physical_drive.medium_type === 'ssd' ? 'SSD' : 'Unknown',
    health: d.physical_drive && d.physical_drive.smart_status === 'Verified' ? 'Healthy' : (d.physical_drive ? d.physical_drive.smart_status : 'Unknown')
  }));
  const maxCap = parseInt(String(health.sppower_battery_health_maximum_capacity || '').replace(/[^0-9]/g, ''), 10);
  const lock = String(hw.activation_lock_status || '');

  return {
    platform: 'mac',
    manufacturer: 'Apple',
    model: [hw.machine_name, hw.machine_model].filter(Boolean).join(' '),
    chassis: /book/i.test(hw.machine_name || '') ? 'laptop' : 'desktop',
    gpus: [],
    serial: hw.serial_number || null,
    os: { name: 'macOS ' + ver.trim(), version: ver.trim() },
    cpu: hw.chip_type || hw.cpu_type || null,
    ramGB,
    disks,
    encryption: { state: /FileVault is On/i.test(fv) ? 'on' : /FileVault is Off/i.test(fv) ? 'off' : 'unknown', detail: fv.trim() },
    management: {
      known: !!mdm,
      mdm: /MDM enrollment: Yes/i.test(mdm),
      dep: /Enrolled via DEP: Yes/i.test(mdm)
    },
    findMy: { known: !!lock, on: /enabled/i.test(lock) && !/disabled/i.test(lock) },
    battery: batt ? { present: true, healthPct: Number.isFinite(maxCap) ? maxCap : null, cycles: health.sppower_battery_cycle_count || null, condition: health.sppower_battery_health || null } : { present: false },
    wifi: { present: (sp.SPAirPortDataType || []).length > 0, up: null },
    bluetooth: { present: (sp.SPBluetoothDataType || []).length > 0 },
    cameras: (sp.SPCameraDataType || []).length,
    touch: false,
    fingerprint: null,
    optical: false,
    cardReader: null,
    profiles: users
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
