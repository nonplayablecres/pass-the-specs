// Turns the system scan into results for the checklist.
// Each result: { status: 'pass' | 'fail' | 'na' | null, detail }
//   status null = still needs the tester, but shows the detail as a hint.
// Anything not listed here is a normal manual check.

export const SETTINGS = {
  // Mobicode check page. Use {serial} where the serial number goes, e.g.
  // 'https://example-mobicode-site/check?serial={serial}'. Leave '' until you have it.
  mobicodeUrl: '',
  stressSeconds: 60, // how long the stress test runs
  stressThrottleFail: 0.6, // fail if it drops below 60% of its starting speed (overheating)
  batteryFailBelow: 50, // % of original capacity
  storageTolerance: 0.08 // 8% either way when comparing drive size to the listing
};

const CPU_RE = /\b(i[3579]-?\s?\d{4,5}[a-z0-9]*|ryzen\s*\d\s*(?:pro\s*)?\d{4}[a-z0-9]*|apple\s*m[1-9](?:\s*(?:pro|max|ultra))?|m[1-9](?:\s*(?:pro|max|ultra))?|celeron\s*\w+|pentium\s*\w+|core\s*ultra\s*\d\s*\d{3}[a-z]*)\b/i;

// Reads a CeX-style listing title, e.g.
// "Dell Latitude 5420/i5-1145G7/16GB Ram/256GB SSD/14"/W10/B"
export function parseListing(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  const ram = t.match(/(\d+)\s*GB\s*(?:(?:LP)?DDR\d\w*|RAM)/i);
  const sto = t.match(/(\d+(?:\.\d+)?)\s*(GB|TB)\s*(SSD|HDD|eMMC|NVMe|M\.2|Flash)/i);
  const cpu = t.match(CPU_RE);
  const gpu = t.match(/\b((?:RTX|GTX|RX|Arc)\s?[A-Z]?\d{3,4}(?:\s?(?:Ti|Super|XT|XTX))?)\b/i);
  const parts = t.split('/').map((s) => s.trim());
  const grade = /^[A-C]$/i.test(parts[parts.length - 1] || '') ? parts[parts.length - 1].toUpperCase() : null;
  const out = {
    title: t,
    name: parts[0] || t,
    ramGB: ram ? Number(ram[1]) : null,
    storageGB: sto ? Math.round(Number(sto[1]) * (/TB/i.test(sto[2]) ? 1000 : 1)) : null,
    storageType: sto ? sto[3].toUpperCase() : null,
    cpu: cpu ? cpu[1] : null,
    gpu: gpu ? gpu[1] : null,
    grade
  };
  return out.ramGB || out.storageGB || out.cpu ? out : { ...out, unreadable: true };
}

export function shortCpu(name) {
  const m = String(name || '').match(CPU_RE);
  return m ? m[1] : String(name || '').replace(/\(R\)|\(TM\)|CPU|@.*$/gi, '').replace(/\s+/g, ' ').trim();
}

export function mainDisk(info) {
  const disks = (info.disks || []).filter((d) => d.sizeGB > 0);
  return disks.sort((a, b) => b.sizeGB - a.sizeGB)[0] || null;
}

// ---- CeX-style naming -------------------------------------------------------
// Laptop:  Asus G18 G814FP/Ryzen 9 9955HX/32GB RAM/1TB SSD/RTX 5070/18"240Hz/W11
// Custom:  Custom/Ryzen 7 5700X3D/32GB DDR4/2TB SSD/RTX 4060 Ti/W11
// (the grade on the end comes from the till, so it's left off)

// Marketing words makers put in the model name that CeX leaves out.
// Add to this list if a name comes out too long.
const MODEL_JUNK = /\b(republic of gamers|rog|strix|laptop|notebook|gaming|by hp|computer|pc)\b/gi;

const BOARD_MAKERS = /micro-star|msi|gigabyte|asrock|asustek|biostar|evga|nzxt|to be filled|system manufacturer|default string|o\.e\.m|not applicable/i;
const BRANDS = [[/dell/i, 'Dell'], [/hewlett|^hp/i, 'HP'], [/lenovo/i, 'Lenovo'], [/asus/i, 'Asus'], [/acer/i, 'Acer'], [/microsoft/i, 'Microsoft'],
  [/samsung/i, 'Samsung'], [/toshiba|dynabook/i, 'Toshiba'], [/msi|micro-star/i, 'MSI'], [/razer/i, 'Razer'], [/gigabyte/i, 'Gigabyte'], [/apple/i, 'Apple'], [/huawei/i, 'Huawei'], [/medion/i, 'Medion'], [/fujitsu/i, 'Fujitsu'], [/panasonic/i, 'Panasonic']];

// Companies that build PCs to order from normal parts. CeX lists these as "Custom".
// Add any others you come across.
const SYSTEM_BUILDERS = /\bscan\b|3xs|pc ?specialist|chillblast|cyberpower|overclockers|infinity|fierce|ccl|box\.co|novatech|stormforce|palicomp|aw ?gaming|zoostorm|yoyotech|ebuyer|custom|white ?box|whitebox/i;

export function isCustomBuild(info, deviceType) {
  if (!info || deviceType === 'laptop' || deviceType === 'mac' || info.chassis === 'laptop') return false;
  const who = `${info.manufacturer || ''} ${info.model || ''}`;
  return BOARD_MAKERS.test(who) || SYSTEM_BUILDERS.test(who) || !info.manufacturer;
}

export function machineName(info, deviceType) {
  if (!info) return '';
  if (isCustomBuild(info, deviceType)) return 'Custom';
  const brand = (BRANDS.find(([re]) => re.test(info.manufacturer || '')) || [null, (info.manufacturer || '').split(' ')[0]])[1];
  // Lenovo's real model name lives in productVersion
  let model = /lenovo/i.test(info.manufacturer || '') && info.productVersion ? info.productVersion : info.model || '';
  model = model
    .replace(/_/g, ' ') // Asus: "ROG Strix G18 G814FP_G814FP"
    .replace(MODEL_JUNK, '')
    .replace(new RegExp('\\b' + brand + '\\b', 'gi'), '')
    .replace(/\s+/g, ' ')
    .trim();
  // Drop repeated words ("G814FP G814FP" -> "G814FP")
  const seen = new Set();
  model = model.split(' ').filter((w) => { const k = w.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).join(' ');
  return [brand, model].filter(Boolean).join(' ');
}

export function storageLabel(gb) {
  if (!gb) return null;
  const sizes = [32, 64, 120, 128, 240, 250, 256, 480, 500, 512, 1000, 2000, 4000, 8000];
  const near = sizes.reduce((a, b) => (Math.abs(b - gb) < Math.abs(a - gb) ? b : a));
  const size = Math.abs(near - gb) / gb < 0.1 ? near : gb;
  return size >= 1000 ? +(size / 1000).toFixed(1) + 'TB' : size + 'GB';
}

export function gpuLabel(info) {
  const gpus = (info.gpus || []).filter((g) => /nvidia|geforce|quadro|rtx|gtx|radeon rx|radeon pro|arc a/i.test(g.name || '') && !/basic|virtual|parsec|remote/i.test(g.name));
  if (!gpus.length) return null;
  const g = gpus.sort((a, b) => (b.vramGB || 0) - (a.vramGB || 0))[0];
  return g.name.replace(/nvidia|geforce|amd|radeon(?= rx)|intel\(r\)|laptop gpu|\(tm\)|\(r\)/gi, '').replace(/\bSUPER\b/, 'Super').replace(/\bTI\b/, 'Ti').replace(/\s+/g, ' ').trim();
}

function osLabel(info) {
  const n = (info.os && info.os.name) || '';
  if (/Windows 11/i.test(n)) return 'W11';
  if (/Windows 10/i.test(n)) return 'W10';
  if (/macOS/i.test(n)) return 'macOS';
  return null;
}

export function cexTitle(info, deviceType) {
  if (!info) return '';
  const d = mainDisk(info);
  const laptop = deviceType === 'laptop' || info.chassis === 'laptop';
  const custom = isCustomBuild(info, deviceType);
  // Refresh rate only shown when it's above a normal 60Hz screen
  const hz = info.maxRefresh && info.maxRefresh >= 90 ? `${info.maxRefresh}Hz` : '';
  const screen = laptop && info.screenInches ? `${Math.round(info.screenInches * 10) / 10}"${hz}` : null;
  // Custom PCs show the memory type (32GB DDR4), everything else 32GB RAM
  const ram = info.ramGB ? `${info.ramGB}GB ${custom && info.ramType ? info.ramType : 'RAM'}` : null;
  return [
    machineName(info, deviceType),
    shortCpu(info.cpu),
    ram,
    d ? `${storageLabel(d.sizeGB)} ${/hdd/i.test(d.type || '') ? 'HDD' : 'SSD'}` : null,
    gpuLabel(info),
    screen,
    osLabel(info)
  ].filter(Boolean).join('/');
}

export function describeSpec(info) {
  if (!info) return '';
  const d = mainDisk(info);
  return [shortCpu(info.cpu), info.ramGB ? info.ramGB + 'GB RAM' : null, d ? d.sizeGB + 'GB ' + (d.type && d.type !== 'Unspecified' ? d.type : 'drive') : null]
    .filter(Boolean).join(' · ');
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// A spec that doesn't match the listing is NOT a fault. It means the machine
// belongs on a different listing, so it comes back as 'diff' (a warning).
export function specCheck(info, expected, deviceType) {
  const found = cexTitle(info, deviceType) || describeSpec(info);
  if (!expected || expected.unreadable) return { status: null, detail: 'Detected: ' + found };
  const problems = [];
  if (expected.ramGB && info.ramGB && expected.ramGB !== info.ramGB) problems.push(`RAM ${info.ramGB}GB, listing says ${expected.ramGB}GB`);
  const d = mainDisk(info);
  if (expected.storageGB && d) {
    const diff = Math.abs(d.sizeGB - expected.storageGB) / expected.storageGB;
    if (diff > SETTINGS.storageTolerance) problems.push(`Storage ${d.sizeGB}GB, listing says ${expected.storageGB}GB`);
  }
  if (expected.cpu && info.cpu && !norm(info.cpu).includes(norm(expected.cpu).replace(/^apple/, ''))) {
    problems.push(`CPU ${shortCpu(info.cpu)}, listing says ${expected.cpu}`);
  }
  if (expected.gpu) {
    const g = gpuLabel(info);
    if (!g || !norm(g).includes(norm(expected.gpu))) problems.push(`Graphics ${g || 'none found'}, listing says ${expected.gpu}`);
  }
  if (problems.length) return { status: 'diff', detail: problems.join(' · '), differences: problems, actual: found };
  return { status: 'pass', detail: 'Matches listing: ' + found };
}

export function evaluate(deviceType, info, expected) {
  const r = {};
  const isMac = deviceType === 'mac' || (info && info.platform === 'mac');
  const isDesktop = deviceType === 'desktop';

  // Rules that don't need the scan
  r.m29 = { status: 'na', detail: 'An operating system is installed' };
  if (!isMac) r.v6 = { status: 'na', detail: 'Not a Mac' };
  if (isDesktop) {
    r.m12 = { status: 'na', detail: 'Desktop: no trackpad' };
    r.m24 = { status: 'na', detail: 'Desktop: no battery' };
  }
  if (isMac) {
    r.m4 = { status: 'na', detail: 'Mac: no licence key' };
    r.m7 = { status: 'na', detail: 'Mac: not applicable' };
    r.m28 = { status: 'na', detail: 'Mac: not applicable' };
    r.m6 = { status: null, detail: 'On a Mac, check Startup Security Utility for a firmware password' };
  }

  if (!info) return r;

  // It's running the app, so it booted
  r.m8 = { status: 'pass', detail: isMac ? 'Booted to macOS' : 'Booted to Windows' };

  // Spec vs listing
  r.m5 = specCheck(info, expected, deviceType);

  // Encryption
  const enc = info.encryption || {};
  if (enc.state === 'off') r.m9 = { status: 'pass', detail: isMac ? 'FileVault is off' : 'Drive is not encrypted' };
  else if (enc.state === 'on') r.m9 = { status: 'fail', detail: (isMac ? 'FileVault is ON. ' : (enc.detail || 'BitLocker is ON') + '. ') + 'Turn it off, then Re-scan.' };
  else if (enc.state === 'waiting') r.m9 = { status: null, detail: 'Device encryption is ready but not active. Turn it off in Settings to be safe.' };

  // Remote management
  const mg = info.management || {};
  if (mg.known) {
    const found = [];
    if (mg.azureAd) found.push('Azure AD / work account');
    if (mg.enterprise) found.push('Enterprise join');
    if (mg.domain) found.push('Company domain');
    if (mg.mdm && mg.mdm.length) found.push('MDM: ' + mg.mdm.join(', '));
    if (mg.dep) found.push('Apple Business (DEP)');
    if (mg.mdm === true) found.push('MDM profile');
    r.m10 = found.length ? { status: 'fail', detail: 'Managed: ' + found.join(' · ') } : { status: 'pass', detail: 'Not enrolled in any management' };
  }

  // Find My (Mac)
  if (isMac && info.findMy && info.findMy.known) {
    r.v6 = info.findMy.on ? { status: 'fail', detail: 'Activation Lock / Find My is ON' } : { status: 'pass', detail: 'Activation Lock is off' };
  }

  if (!isMac) {
    // Windows 11
    const osName = (info.os && info.os.name) || '';
    const tpm = info.tpm || {};
    if (/Windows 11/i.test(osName)) r.m7 = { status: 'pass', detail: 'Already running Windows 11' };
    else if (tpm.present === false || /^1/.test(tpm.version || '')) r.m7 = { status: 'fail', detail: 'No TPM 2.0 found' };
    else if (/^2/.test(tpm.version || '') && info.secureBoot === true) r.m7 = { status: null, detail: 'TPM 2.0 and Secure Boot OK. Confirm the CPU is supported.' };

    // Activation + licence key
    const act = info.activation || {};
    if (act.known) r.m28 = act.activated ? { status: 'pass', detail: 'Windows is activated' } : { status: 'fail', detail: 'Not activated' };
    if (info.firmwareKey) r.m4 = { status: 'pass', detail: 'Licence key stored in the firmware' };
    else if (act.known && act.activated) r.m4 = { status: 'pass', detail: 'Activated with a digital licence' + (act.channel ? ` (${act.channel})` : '') };
    else if (act.known) r.m4 = { status: 'fail', detail: 'No licence key found and Windows isn’t activated' };

    // BIOS passwords
    const bp = info.biosPassword || {};
    if (bp.known && !bp.set) r.m6 = { status: 'pass', detail: 'No BIOS password set' + (bp.source && bp.source !== 'generic' ? ` (${bp.source} firmware)` : '') };
    else if (bp.known && bp.set && bp.source !== 'generic') r.m6 = { status: 'fail', detail: bp.detail || 'BIOS password set' };
    else if (bp.known && bp.set) r.m6 = { status: null, detail: 'Firmware says a password may be set. Check in the BIOS.' };
  }

  // Wireless
  const wifi = info.wifi || {};
  const bt = info.bluetooth || {};
  if (wifi.present && wifi.up && bt.present) r.m17 = { status: 'pass', detail: 'WiFi connected · Bluetooth working' };
  else if (wifi.present || bt.present) r.m17 = { status: null, detail: `WiFi: ${wifi.present ? (wifi.up ? 'connected' : 'found, not connected') : 'not found'} · Bluetooth: ${bt.present ? 'found' : 'not found'}` };

  // Battery
  const b = info.battery || {};
  if (!isDesktop) {
    if (b.present && b.healthPct) {
      const d = `${b.healthPct}% of original capacity${b.cycles ? ' · ' + b.cycles + ' cycles' : ''}`;
      r.m24 = b.healthPct < SETTINGS.batteryFailBelow ? { status: 'fail', detail: d } : { status: 'pass', detail: d };
    } else if (b.present === false && deviceType === 'laptop') {
      r.m24 = { status: 'fail', detail: 'No battery detected' };
    }
  }

  // Drive health
  const disks = info.disks || [];
  if (disks.length) {
    const bad = disks.filter((d) => d.health && !/healthy|verified/i.test(d.health));
    const wear = disks.map((d) => d.wear).filter((w) => w != null);
    r.m26 = bad.length
      ? { status: 'fail', detail: bad.map((d) => `${d.name}: ${d.health}`).join(' · ') }
      : { status: 'pass', detail: 'Drive health good' + (wear.length ? ` · ${Math.max(...wear)}% wear` : '') };
  }

  // Parts this machine doesn't have
  if (info.touch === false) r.m15 = { status: 'na', detail: 'No touchscreen on this machine' };
  if (info.fingerprint === false) r.m13 = { status: 'na', detail: 'No fingerprint reader on this machine' };
  if (info.optical === false) {
    r.m23 = { status: 'na', detail: 'No disc drive' };
    r.m25 = { status: 'na', detail: 'No disc drive' };
  }
  if (info.cameras === 0) r.m19 = { status: 'na', detail: 'No camera on this machine' };
  if (info.cardReader === false) r.m22 = { status: 'na', detail: 'No memory card reader on this machine' };

  // Crash history, shown on the stress test
  const st = info.stability;
  if (st && (st.bluescreens || st.unexpectedShutdowns)) {
    r.m11 = { status: null, detail: `Heads up: ${st.bluescreens} blue screen${st.bluescreens === 1 ? '' : 's'} and ${st.unexpectedShutdowns} unexpected shutdown${st.unexpectedShutdowns === 1 ? '' : 's'} in the last 30 days.` };
  }

  // Accounts left (rechecked with Re-scan after the reset)
  if (Array.isArray(info.profiles)) {
    r.m30 = { status: null, detail: `User accounts found: ${info.profiles.length ? info.profiles.join(', ') : 'none'}` };
  }

  return r;
}
