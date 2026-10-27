// Finds this machine's listing on CeX from what's actually inside it.
//   exact - same model, CPU, RAM, storage (and graphics card) -> box IDs per grade
//   near  - same model and CPU, but RAM / storage / graphics differ
//   none  - nothing on CeX -> price request
import { bridge } from './bridge.js';
import { colourName, gpuLabel, sameColour, machineName, mainDisk, parseListing, shortCpu, storageLabel } from './autoChecks.js';

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

export async function findListing(info, deviceType, opts = {}) {
  if (!info) return { status: 'error', error: 'No scan' };
  const name = machineName(info, deviceType);
  const cpu = shortCpu(info.cpu);
  const disk = mainDisk(info);
  const target = {
    name,
    cpu,
    ramGB: info.ramGB || null,
    storageGB: disk ? disk.sizeGB : null,
    gpu: gpuLabel(info)
  };
  const query = [name, cpu].filter(Boolean).join(' ');

  const res = await bridge.cexSearch(query);
  if (!res || !res.ok) return { status: 'error', error: (res && res.error) || 'Search failed', query };

  const exact = [];
  const near = [];
  for (const hit of res.hits) {
    const p = parseListing(hit.boxName);
    if (!p || p.unreadable) continue;
    const nameOk = norm(p.name) === norm(name) || (name !== 'Custom' && norm(p.name).includes(norm(name)));
    const cpuOk = p.cpu && cpu ? norm(p.cpu) === norm(cpu) : true;
    if (!nameOk || !cpuOk) continue;

    const diffs = [];
    if (p.ramGB && target.ramGB && p.ramGB !== target.ramGB) diffs.push(`${p.ramGB}GB Ram`);
    if (p.storageGB && target.storageGB && Math.abs(p.storageGB - target.storageGB) / p.storageGB > 0.1) diffs.push(`${storageLabel(p.storageGB)} ${p.storageType || ''}`.trim());
    const gpuOk = target.gpu ? !!p.gpu && norm(target.gpu).includes(norm(p.gpu)) : !p.gpu;
    if (!gpuOk) diffs.push(p.gpu || 'no graphics card');
    // Colour (Macs): only the colour picked on the start screen is an exact match
    if (opts.colour && p.colour && !sameColour(p.colour, opts.colour)) diffs.push(colourName(p.colour));

    const item = { ...hit, grade: p.grade || '?', colour: p.colour || null, diffs };
    if (diffs.length) near.push(item); else exact.push(item);
  }

  const byGrade = (a, b) => String(a.grade).localeCompare(String(b.grade));
  exact.sort(byGrade);
  // One row per different spec for the "close" list
  const seen = new Set();
  const nearUnique = near.filter((n) => { const k = n.diffs.join('|'); if (seen.has(k)) return false; seen.add(k); return true; });

  return {
    status: exact.length ? 'exact' : nearUnique.length ? 'near' : 'none',
    exact,
    near: nearUnique.slice(0, 4),
    query,
    mock: !!res.mock
  };
}

// Monitors, drives, headphones etc: find the listing from a model name / code.
// Exact = listings that contain the model code (the part with numbers in it).
export async function findByModel(model) {
  const query = String(model || '').trim();
  if (!query) return { status: 'none', exact: [], near: [], query };
  const res = await bridge.cexSearch(query);
  if (!res || !res.ok) return { status: 'error', error: (res && res.error) || 'Search failed', query };
  const words = query.split(/\s+/).map(norm).filter(Boolean);
  const codes = words.filter((w) => /\d/.test(w) && w.length >= 4);
  const must = codes.length ? codes : words;
  const exact = res.hits
    .filter((h) => must.every((w) => norm(h.boxName).includes(w)))
    .map((h) => {
      const g = String(h.boxName).match(/(?:[,/]|\s-)\s*([A-C])\s*$/i);
      return { ...h, grade: g ? g[1].toUpperCase() : '?', label: h.boxName, diffs: [] };
    })
    .sort((a, b) => String(a.grade).localeCompare(String(b.grade)));
  return { status: exact.length ? 'exact' : 'none', exact: exact.slice(0, 9), near: [], query, mock: !!res.mock };
}
