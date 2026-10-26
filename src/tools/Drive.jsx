import { useEffect, useState, useSyncExternalStore } from 'react';
import { bridge } from '../lib/bridge.js';
import { driveModel, expectedSpeed, judgeHealth, judgeSpeed, sizeLabel } from '../lib/driveRules.js';

// One drive test shared by the three drive checks (health, bad sectors, speed),
// so the drive is picked once and every result stays when moving between checks.
let state = { loading: false, error: '', drives: null, picked: null, scan: null, speed: null, running: '', progress: null };
const subs = new Set();
let autoModel = '';
const setState = (patch) => { state = { ...state, ...patch }; subs.forEach((f) => f()); };
const useDriveState = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => state);
export function resetDriveTest() { autoModel = ''; state = { loading: false, error: '', drives: null, picked: null, scan: null, speed: null, running: '', progress: null }; }

async function loadDrives() {
  setState({ loading: true, error: '' });
  const res = await bridge.drives();
  if (!res || !res.ok) setState({ loading: false, error: res && res.error === 'old-app' ? 'old-app' : (res && res.error) || 'Couldn’t list drives' });
  else {
    const picked = state.picked != null && res.drives.some((d) => d.number === state.picked) ? state.picked : null;
    setState({ loading: false, drives: res.drives, picked });
  }
}

const mbs = (v) => (v == null ? '—' : v >= 1000 ? `${(v / 1000).toFixed(2)} GB/s` : `${Math.round(v)} MB/s`);
const dur = (s) => (s == null ? '' : s > 3600 ? `${Math.floor(s / 3600)}h ${Math.round((s % 3600) / 60)}m` : s > 60 ? `${Math.round(s / 60)} min` : `${Math.round(s)} sec`);

function Picker({ drives, picked, onPick }) {
  const others = drives.filter((d) => !d.boot);
  const hidden = drives.length - others.length;
  return (
    <div className="picker">
      <span className="eyebrow">Drive to test</span>
      {others.length === 0 && <div className="hint">No other drive found. Connect it (SATA cable, M.2 slot or a USB adapter), then press Refresh.</div>}
      <div className="drive-list">
        {others.map((d) => (
          <button key={d.number} type="button" className={'drive-row' + (picked === d.number ? ' on' : '')} onClick={() => onPick(d)}>
            <b>{d.model}</b>
            <span>{sizeLabel(d.sizeBytes)} · {expectedSpeed(d).type}{d.bus ? ' · ' + d.bus : ''}{d.volumes && d.volumes.length ? ' · ' + d.volumes.map((v) => (/^[A-Z]$/i.test(v.letter) ? v.letter + ':' : v.label || v.letter)).join(' ') : ' · no partition'}</span>
          </button>
        ))}
      </div>
      <span className="muted" style={{ fontSize: 12 }}>
        <button type="button" className="link-btn" onClick={loadDrives}>↻ Refresh</button>
        {hidden ? ' · This computer’s own drive is hidden.' : ''}
      </span>
    </div>
  );
}

function Health({ d, report }) {
  const h = judgeHealth(d);
  useEffect(() => {
    if (h.status === 'pass' || h.status === 'fail') report(h.status, h.status === 'pass' ? ['Healthy', ...h.info].join(' · ') : h.bad.join(' · '));
  }, [d.number]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={'drive-panel ' + h.status}>
      <b className="pixel" style={{ fontSize: 12 }}>{h.status === 'pass' ? 'HEALTHY' : h.status === 'fail' ? 'FAULTY' : 'NO HEALTH REPORT'}</b>
      {h.bad.map((x) => <span key={x} className="bad">✕ {x}</span>)}
      {h.warn.map((x) => <span key={x} className="meh">! {x}</span>)}
      {h.info.map((x) => <span key={x}>{x}</span>)}
      {h.status === 'unknown' && <span>This drive (or its USB adapter) doesn’t share a health report. Run the bad sector scan instead.</span>}
      {d.serial && <span className="muted">Serial {d.serial}</span>}
    </div>
  );
}

// Technical details of why reading failed, to copy and send for help
function Details({ text }) {
  const [copied, setCopied] = useState(false);
  if (!text) return null;
  return (
    <details className="drive-details">
      <summary>Technical details</summary>
      <pre>{text}</pre>
      <button type="button" className="btn" style={{ minHeight: 36 }} onClick={() => { bridge.copy(text); setCopied(true); }}>{copied ? 'Copied ✓' : 'Copy details'}</button>
    </details>
  );
}

// The whole drive as a grid of squares, start (top left) to end (bottom right):
// grey = not read yet, green = reads fine, amber = slow (weak), red = unreadable
function SectorMap({ map }) {
  return (
    <div className="sector-wrap">
      <div className="sector-map" role="img" aria-label={`Sector map: ${(map.match(/b/g) || []).length} bad areas, ${(map.match(/s/g) || []).length} slow areas`}>
        {map.split('').map((c, i) => <i key={i} className={'sc ' + c} />)}
      </div>
      <div className="sector-key">
        <span><i className="sc g" /> Good</span><span><i className="sc s" /> Slow</span><span><i className="sc b" /> Bad</span><span><i className="sc ." /> Not read</span>
        <span className="muted">Start of drive top left → end bottom right</span>
      </div>
    </div>
  );
}

function Scan({ d, report }) {
  const s = useDriveState();
  const res = s.scan && s.scan.number === d.number ? s.scan : null;
  const busy = s.running === 'scan';
  const p = busy ? s.progress : null;
  const run = async (mode) => {
    setState({ running: 'scan', progress: null, scan: null });
    const out = await bridge.driveScan({ number: d.number, mode, sizeBytes: d.sizeBytes, media: d.media, volumes: d.volumes });
    setState({ running: '', progress: null, scan: { ...out, number: d.number } });
    if (out.ok && !out.stopped) {
      const bad = out.badBytes > 0;
      const weak = out.slow > 10;
      report(bad || weak ? 'fail' : 'pass', bad ? `${Math.round(out.badBytes / 1024)} KB unreadable (${mode} scan)` : weak ? `${out.slow} weak / slow areas (${mode} scan)` : `No bad sectors (${mode} scan)`);
    }
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="tool-row">
        <button type="button" className="btn primary" disabled={busy} onClick={() => run('quick')}>▶ QUICK SCAN</button>
        <button type="button" className="btn" disabled={busy} onClick={() => run('full')}>▶ FULL SCAN</button>
        {busy && <button type="button" className="btn" onClick={() => bridge.driveStop()}>■ Stop</button>}
        <span className="muted" style={{ fontSize: 13, marginLeft: 8 }}>Quick: under a minute, checks spots across the whole drive. Full: reads every sector{d.sizeBytes ? `, roughly ${dur(d.sizeBytes / 1e6 / (expectedSpeed(d).hdd ? 140 : 1500))}` : ''}.</span>
      </div>
      {busy && !p && <div className="hint"><span className="dot wait" style={{ display: 'inline-block' }} /> Opening the drive…</div>}
      {(p || res) && (() => {
        const r = p || res;
        const pct = r.total ? Math.min(100, (r.done / r.total) * 100) : 0;
        return (
          <div className={'drive-panel ' + (busy ? '' : r.error ? 'fail' : r.badBytes > 0 || r.slow > 10 ? 'fail' : r.stopped ? '' : 'pass')}>
            {r.error ? <><span className="bad">{r.error}</span><Details text={r.details} /></> : (
              <>
                {r.map && <SectorMap map={r.map} />}
                <div className="bar big"><div style={{ width: `${pct}%` }} /></div>
                <span>
                  <b className="pixel" style={{ fontSize: 11 }}>{Math.floor(pct)}%</b>
                  {' · '}{mbs(r.speed)}{busy && r.eta != null ? ` · ${dur(r.eta)} left` : ''}{!busy && r.stopped ? ' · stopped' : ''}
                </span>
                <span className={r.badBytes > 0 ? 'bad' : ''}>{r.badBytes > 0 ? `✕ ${Math.round(r.badBytes / 1024)} KB unreadable, around ${r.badSpots.map((m) => (m / 1000).toFixed(1) + ' GB').join(', ')}` : '✓ No unreadable sectors'}</span>
                <span className={r.slow > 10 ? 'bad' : r.slow ? 'meh' : ''}>{r.slow ? `${r.slow} slow areas (weak sectors)` : 'No slow areas'}</span>
                {r.note && <span className="muted">{r.note}</span>}
              </>
            )}
          </div>
        );
      })()}
    </div>
  );
}

function Speed({ d, report }) {
  const s = useDriveState();
  const res = s.speed && s.speed.number === d.number ? s.speed : null;
  const busy = s.running === 'speed';
  const e = expectedSpeed(d);
  const run = async () => {
    setState({ running: 'speed', progress: null, speed: null });
    const out = await bridge.driveSpeed({ number: d.number, sizeBytes: d.sizeBytes, volumes: d.volumes });
    setState({ running: '', progress: null, speed: { ...out, number: d.number } });
    if (out.ok) {
      const j = judgeSpeed(d, out);
      if (j.status !== 'unknown') report(j.status, `Read ${mbs(out.read)} · Write ${mbs(out.write)} (expected about ${mbs(j.wantRead)} / ${mbs(j.wantWrite)})`);
    }
  };
  const j = res && res.ok ? judgeSpeed(d, res) : null;
  const row = (name, val, want, ok) => (
    <div className="speed-row">
      <span>{name}</span>
      <div className="bar big"><div className={ok === false ? 'bad' : ''} style={{ width: `${Math.min(100, ((val || 0) / (want * 1.2)) * 100)}%` }} /><i style={{ left: `${(1 / 1.2) * 100}%` }} title="Expected" /></div>
      <b>{mbs(val)}</b>
      <span className="muted">expected ~{mbs(want)}</span>
    </div>
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="tool-row">
        <button type="button" className="btn primary" disabled={busy} onClick={run}>{busy ? (s.progress && s.progress.phase === 'write' ? 'Testing write…' : 'Testing read…') : '▶ RUN SPEED TEST'}</button>
        <span className="muted" style={{ fontSize: 13, marginLeft: 8 }}>
          {e.kind}{e.rated ? ' (rated speeds)' : ' (typical for this type)'}. Takes about 10 seconds. The write test uses a temporary file and deletes it.
        </span>
      </div>
      {e.usb && <div className="warn">Connected by USB, so the adapter limits the speed. Fit it inside a PC to see its real speed.</div>}
      {res && !res.ok && <div className="warn">{res.error}</div>}
      {j && (
        <div className={'drive-panel ' + j.status}>
          {row('READ', res.read, j.wantRead, j.readOk)}
          {row('WRITE', res.write, j.wantWrite, j.writeOk)}
          {res.notes.map((n) => <span key={n} className="muted">{n}</span>)}
          <Details text={res.details} />
        </div>
      )}
    </div>
  );
}

// The scan / speed test changed in app 0.1.17; older app copies can't run them
const older = (v, than) => {
  const a = String(v || '0').split('.').map(Number);
  const b = than.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((a[i] || 0) !== b[i]) return (a[i] || 0) < b[i];
  return false;
};
let shellVersion = null;

export default function Drive({ step, report, model, setModel }) {
  const s = useDriveState();
  const [shell, setShell] = useState(shellVersion);
  useEffect(() => { if (!shellVersion && bridge.inShell) bridge.appInfo().then((i) => { shellVersion = i.shellVersion || '0'; setShell(shellVersion); }).catch(() => {}); }, []);
  useEffect(() => {
    if (!state.drives && !state.loading) loadDrives();
    return bridge.onDriveProgress((p) => setState({ progress: p }));
  }, []);

  if (!bridge.hasDrives || s.error === 'old-app') {
    return <div className="warn">The drive tester needs the newest app. Download it once from the latest release (the exe or the Mac app), then it keeps itself up to date.</div>;
  }
  if (s.error) return <div className="warn">{s.error}<button type="button" className="btn" style={{ alignSelf: 'flex-start', minHeight: 40 }} onClick={loadDrives}>Try again</button></div>;
  if (!s.drives) return <div className="hint"><span className="dot wait" style={{ display: 'inline-block' }} /> Looking for drives…</div>;

  const d = s.drives.find((x) => x.number === s.picked);
  const pick = (drive) => {
    setState({ picked: drive.number });
    // Fill in the model for the CeX listing, unless the tester typed their own
    if (setModel && (!String(model || '').trim() || model === autoModel)) { autoModel = driveModel(drive); setModel(autoModel); }
  };
  return (
    <div className="tool" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Picker drives={s.drives} picked={s.picked} onPick={pick} />
      {d && step === 'health' && <Health d={d} report={report} />}
      {d && step !== 'health' && shell && older(shell, '0.1.17') && <div className="warn">This test needs the newest app (v0.1.17 or later). Download it once from the latest release, then it keeps itself up to date.</div>}
      {d && step === 'scan' && !(shell && older(shell, '0.1.17')) && (typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform)
        ? <div className="hint">macOS doesn’t let apps read every sector, so the bad sector scan needs a Windows PC. On a Mac, rely on the health check and speed test.</div>
        : <Scan d={d} report={report} />)}
      {d && step === 'speed' && !(shell && older(shell, '0.1.17')) && <Speed d={d} report={report} />}
      {!d && s.drives.some((x) => !x.boot) && <span className="muted">Pick the drive above.</span>}
    </div>
  );
}
