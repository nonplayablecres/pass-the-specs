import { useCallback, useEffect, useMemo, useState } from 'react';
import Header from './components/Header.jsx';
import Start from './screens/Start.jsx';
import Runner from './screens/Runner.jsx';
import Result from './screens/Result.jsx';
import Reset from './screens/Reset.jsx';
import { DEVICE_TYPES, checksFor } from './data/checklists.js';
import { cexTitle, evaluate, machineName, parseListing } from './lib/autoChecks.js';
import { bridge } from './lib/bridge.js';
import { findListing } from './lib/listing.js';

// 'diff' = spec differs from the listing: a warning, not a fault
const DONE = ['pass', 'fail', 'na', 'diff'];

export default function App() {
  const [scan, setScan] = useState({ loading: true, info: null, error: '', mock: false });
  const [appInfo, setAppInfo] = useState({ uiVersion: __APP_VERSION__ });
  const [update, setUpdate] = useState(null);
  const [screen, setScreen] = useState('start');
  const [device, setDevice] = useState('laptop');
  const [listing, setListing] = useState('');
  const [boxId, setBoxId] = useState('');
  const [colour, setColour] = useState('');
  const [manual, setManual] = useState({});
  const [startedAt, setStartedAt] = useState(null);
  const [finishedAt, setFinishedAt] = useState(null);

  const runScan = useCallback(async (pickDevice) => {
    setScan((s) => ({ ...s, loading: true, error: '' }));
    const res = await bridge.systemInfo();
    if (res && res.ok) {
      setScan({ loading: false, info: res.info, error: '', mock: !!res.mock });
      if (pickDevice) {
        if (res.info.platform === 'mac') setDevice('mac');
        else if (res.info.chassis === 'laptop' || res.info.chassis === 'desktop') setDevice(res.info.chassis);
        else setDevice(res.info.battery && res.info.battery.present === false ? 'desktop' : 'laptop');
      }
    } else {
      setScan({ loading: false, info: null, error: (res && res.error) || 'Unknown error', mock: false });
    }
  }, []);

  useEffect(() => {
    runScan(true);
    bridge.appInfo().then(setAppInfo).catch(() => {});
    return bridge.onUpdate(setUpdate);
  }, [runScan]);

  const dev = DEVICE_TYPES.find((d) => d.id === device);
  const isComputer = dev && dev.list === 'computer';
  const checks = checksFor(device);
  const expected = useMemo(() => parseListing(listing), [listing]);
  const auto = useMemo(() => (isComputer ? evaluate(device, scan.info, expected) : {}), [isComputer, device, scan.info, expected]);

  const isAuto = (id) => auto[id] && DONE.includes(auto[id].status);
  const manualItems = checks.filter((c) => !c.final && !isAuto(c.id)).map((c) => ({ ...c, hint: auto[c.id] ? auto[c.id].detail : null }));
  const counts = {
    manual: manualItems.length,
    auto: checks.filter((c) => !c.final && isAuto(c.id) && auto[c.id].status !== 'na').length,
    na: checks.filter((c) => isAuto(c.id) && auto[c.id].status === 'na').length
  };
  const autoPass = checks.filter((c) => isAuto(c.id) && auto[c.id].status === 'pass').length;
  const autoFail = checks.filter((c) => isAuto(c.id) && auto[c.id].status === 'fail').length;
  const specDiff = auto.m5 && auto.m5.status === 'diff' ? auto.m5 : null;
  const title = isComputer ? cexTitle(scan.info, device, { colour }) : '';

  const rows = checks.filter((c) => !c.final).map((c) => {
    const a = auto[c.id];
    const m = manual[c.id] || {};
    return { id: c.id, title: c.title, auto: isAuto(c.id), status: isAuto(c.id) ? a.status : m.status || null, detail: (a && a.detail) || m.detail || null, note: m.note || '' };
  });
  const hasReset = checks.some((c) => c.final);

  // What the app detected this machine is. Computer types can't be changed by hand once known.
  const detectedType = scan.info ? (scan.info.platform === 'mac' ? 'mac' : ['laptop', 'desktop'].includes(scan.info.chassis) ? scan.info.chassis : null) : null;

  const setResult = useCallback((id, status, detail) => setManual((m) => ({ ...m, [id]: { ...(m[id] || {}), status, ...(detail ? { detail } : {}) } })), []);
  const setNote = useCallback((id, note) => setManual((m) => ({ ...m, [id]: { ...(m[id] || {}), note } })), []);
  const [resetAt, setResetAt] = useState(null);
  const [reportText, setReportText] = useState('');
  const [lookup, setLookup] = useState(null);

  // Look the machine up on CeX in the background once the test starts
  useEffect(() => {
    if (screen === 'start' || !isComputer || !scan.info) return;
    let cancelled = false;
    setLookup({ loading: true });
    findListing(scan.info, device).then((res) => {
      if (cancelled) return;
      setLookup(res);
      if (res.status === 'exact' && res.exact.length === 1) setBoxId(res.exact[0].boxId);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen === 'start', isComputer, scan.info, device]);

  const start = () => { setManual({}); setStartedAt(Date.now()); setFinishedAt(null); setScreen('run'); };
  const finish = () => { setFinishedAt((f) => f || Date.now()); setScreen('result'); };
  const newTest = () => { setColour(''); setLookup(null); setResetAt(null); setManual({}); setListing(''); setBoxId(''); setStartedAt(null); setFinishedAt(null); setScreen('start'); runScan(true); };

  const deviceLabel = screen === 'start' ? null
    : isComputer && scan.info ? (machineName(scan.info, device) === 'Custom' ? 'Custom PC' : machineName(scan.info, device))
    : dev ? dev.name : null;

  const headerRight = screen === 'start' ? null : (
    <>
      {isComputer && (
        <span className="chip" title="Checks done automatically">
          AUTO
          <span className="pixel" style={{ fontSize: 10, color: 'var(--green-text)' }}>{autoPass}✓</span>
          <span className="pixel" style={{ fontSize: 10, color: 'var(--red-text)' }}>{autoFail}✕</span>
          {specDiff && <span className="pixel" style={{ fontSize: 10, color: 'var(--amber)' }} title="Different listing">1!</span>}
        </span>
      )}
      {isComputer && <button type="button" className="link-btn" onClick={() => runScan(false)} disabled={scan.loading}>{scan.loading ? 'Scanning…' : '↻ Re-scan'}</button>}
      {screen === 'run' && <button type="button" className="link-btn" onClick={finish}>Finish</button>}
      <button type="button" className="link-btn" onClick={() => { if (window.confirm('Leave this test? Results will be lost.')) newTest(); }}>Exit</button>
    </>
  );

  return (
    <div className="app">
      {update && update.status === 'ready' && (
        <div className="update-bar">
          <span>Update <b>v{update.version}</b> downloaded.{screen !== 'start' ? ' It will load after this test.' : ''}</span>
          {screen === 'start' && <button type="button" className="btn light" style={{ minHeight: 40 }} onClick={() => bridge.reload()}>LOAD IT NOW</button>}
        </div>
      )}
      {update && update.status === 'needs-exe' && (
        <div className="update-bar">
          <span>Version <b>v{update.version}</b> is out and needs the new exe.</span>
          <button type="button" className="btn light" style={{ minHeight: 40 }} onClick={() => bridge.openRelease(update.url)}>GET IT</button>
        </div>
      )}

      <Header deviceLabel={deviceLabel} startedAt={screen === 'start' ? null : startedAt} finishedAt={finishedAt} right={headerRight} version={appInfo.uiVersion} />

      {screen === 'start' && (
        <Start colour={colour} setColour={setColour} scan={scan} detectedType={detectedType} title={title} specDiff={specDiff} device={device} setDevice={setDevice} listing={listing} setListing={setListing} boxId={boxId} setBoxId={setBoxId} counts={counts} onStart={start} />
      )}
      {screen === 'run' && (
        <Runner items={manualItems} results={manual} setResult={setResult} setNote={setNote} onFinish={finish} isMac={device === 'mac'} info={isComputer ? scan.info : null} />
      )}
      {screen === 'result' && (
        <Result
          battery={isComputer && scan.info ? scan.info.battery : null}
          rows={rows}
          deviceName={deviceLabel}
          listingName={expected ? expected.title : ''}
          specDiff={specDiff}
          title={title}
          boxId={boxId}
          lookup={isComputer ? lookup : null}
          setBoxId={setBoxId}
          elapsed={(finishedAt || Date.now()) - (startedAt || Date.now())}
          version={appInfo.uiVersion}
          onBack={() => { setFinishedAt(null); setScreen('run'); }}
          onNew={newTest}
          onReset={hasReset ? () => setScreen('reset') : null}
          resetAt={resetAt}
          reportName={`${(scan.info && isComputer && scan.info.serial) || (dev ? dev.name : 'device')}_${new Date(startedAt || Date.now()).toISOString().slice(0, 16).replace(/[T:]/g, '-')}`}
          onReportText={setReportText}
          copy={bridge.copy}
        />
      )}
      {screen === 'reset' && (
        <Reset onBack={() => setScreen('result')} onStarted={setResetAt} resetAt={resetAt} onNew={newTest} reportText={reportText} isMac={device === 'mac'} />
      )}
    </div>
  );
}
