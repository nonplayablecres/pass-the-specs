import { useEffect, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';
import { formatTime } from '../components/Header.jsx';
import { bridge } from '../lib/bridge.js';
import Battery from '../components/Battery.jsx';
import Checklist from '../components/Checklist.jsx';

function Barcode({ value }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current || !value) return;
    try {
      JsBarcode(ref.current, value, { format: 'CODE128', height: 70, margin: 0, fontSize: 14, background: '#ffffff', lineColor: '#111113' });
    } catch { /* invalid characters: leave blank */ }
  }, [value]);
  return value ? <svg ref={ref} role="img" aria-label={`Barcode ${value}`} /> : null;
}

const money = (v) => (v == null ? '-' : '£' + Number(v).toFixed(Number(v) % 1 ? 2 : 0));

function ListingPanel({ lookup, title, boxId, setBoxId, chosen }) {
  if (!lookup) return null;
  if (lookup.loading) return <div className="tool listing"><span className="dot wait" style={{ display: 'inline-block' }} /> Finding the CeX listing…</div>;
  if (lookup.status === 'error') return <div className="tool listing"><b className="muted">COULDN’T REACH CEX</b><span className="muted" style={{ fontSize: 13 }}>{lookup.error}. Type the box ID below if you have it.</span></div>;
  if (lookup.status === 'exact') {
    return (
      <div className="tool listing">
        <b style={{ color: 'var(--green-text)' }}>ON CEX ✓{lookup.mock ? ' (EXAMPLE)' : ''}</b>
        <span className="muted" style={{ fontSize: 13 }}>Pick the grade from the till:</span>
        <div className="grades">
          {lookup.exact.map((h) => (
            <button key={h.boxId} type="button" className={'grade' + (h.boxId === boxId ? ' on' : '')} onClick={() => setBoxId(h.boxId)} aria-pressed={h.boxId === boxId}>
              <span className="pixel" style={{ fontSize: 14 }}>{h.grade}</span>
              {h.colour && new Set(lookup.exact.map((x) => x.colour)).size > 1 && <span style={{ fontSize: 11 }}>{h.colour}</span>}
              <span>{money(h.sell)}</span>
            </button>
          ))}
        </div>
        {chosen && <span style={{ fontSize: 13 }}>Sell {money(chosen.sell)} · Cash {money(chosen.cash)} · Exchange {money(chosen.exchange)}</span>}
      </div>
    );
  }
  return (
    <div className="tool listing">
      <span className="price-request">PRICE REQUEST</span>
      <span style={{ fontSize: 13 }}>CeX doesn’t list <b style={{ userSelect: 'text' }}>{title || 'this spec'}</b>.</span>
      {lookup.near.length > 0 && (
        <div className="warn" style={{ padding: '10px 12px', fontSize: 13 }}>
          <b>SAME MACHINE, DIFFERENT SPEC</b>
          {lookup.near.map((n) => <span key={n.boxId}>Listed with {n.diffs.join(' + ')} · {money(n.sell)}</span>)}
        </div>
      )}
    </div>
  );
}

// rows: every check with { id, title, status, detail, note, auto }
export default function Result({ items, results, onRetest, battery, rows, deviceName, listingName, specDiff, title, boxId, setBoxId, lookup, elapsed, version, onBack, onNew, onReset, resetAt, reportName, onReportText, copy }) {
  const [copied, setCopied] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [saved, setSaved] = useState(null);
  const [battReport, setBattReport] = useState(null);

  // Save Windows' full battery report next to the test report (once per test)
  useEffect(() => {
    if (!bridge.inShell || !battery || !battery.present) return;
    bridge.batteryReport(reportName).then((res) => { if (res && res.ok) setBattReport(res.file); });
  }, [battery, reportName]);
  const fails = rows.filter((r) => r.status === 'fail');
  const passes = rows.filter((r) => r.status === 'pass');
  const nas = rows.filter((r) => r.status === 'na');
  const open = rows.filter((r) => !r.status);
  const verdict = fails.length ? 'FAIL' : open.length ? 'INCOMPLETE' : 'PASS';
  const autos = rows.filter((r) => r.auto && r.status === 'pass');
  const notes = rows.filter((r) => r.note);
  const chosen = lookup && lookup.exact ? lookup.exact.find((h) => h.boxId === boxId) : null;
  const priceRequest = lookup && (lookup.status === 'near' || lookup.status === 'none');

  const text = [
    `Pass the Specs v${version}: ${verdict} ${passes.length}/${passes.length + fails.length}${nas.length ? ` (${nas.length} N/A)` : ''}`,
    title ? `Tested as: ${title}` : deviceName ? `Device: ${deviceName}` : null,
    chosen ? `CeX listing: ${chosen.boxName} (${chosen.boxId})` : null,
    priceRequest ? `PRICE REQUEST: no CeX listing for ${title || 'this spec'}` : null,
    priceRequest && lookup.near.length ? `Closest listings: ${lookup.near.map((n) => n.diffs.join(' + ')).join(', ')}` : null,
    specDiff ? `DIFFERENT LISTING (not a fault): ${specDiff.differences.join(', ')}${listingName ? ` - listing was ${listingName}` : ''}` : null,
    ...fails.map((r) => `FAIL: ${r.title}${r.detail ? ' - ' + r.detail : ''}${r.note ? ' - ' + r.note : ''}`),
    ...open.map((r) => `NOT CHECKED: ${r.title}`),
    ...notes.filter((r) => r.status !== 'fail').map((r) => `Note (${r.title}): ${r.note}`),
    ...rows.filter((r) => r.id === 'm24' && r.detail).map((r) => `Battery: ${r.detail}`),
    ...rows.filter((r) => r.id === 'm11' && r.detail && r.status === 'pass').map((r) => `Stress test: ${r.detail}`),
    `Tested in ${formatTime(elapsed)}`,
    resetAt ? `Factory reset started ${new Date(resetAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : null
  ].filter(Boolean).join('\n');

  // Keep a copy of the report on the USB stick (reports folder), updated as things change
  useEffect(() => {
    if (onReportText) onReportText(text);
    if (!bridge.inShell) return undefined;
    const t = setTimeout(async () => { const res = await bridge.saveReport(reportName, text); setSaved(res); }, 800);
    return () => clearTimeout(t);
  }, [text, reportName, onReportText]);

  const doCopy = async () => { await copy(text); setCopied(true); setTimeout(() => setCopied(false), 1500); };

  return (
    <>
      <div className={'band ' + verdict.toLowerCase()}>
        <div className="band-inner">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.12em', opacity: 0.85 }}>RESULT · {formatTime(elapsed)}</span>
            <span className="verdict">{verdict}</span>
            <span style={{ fontSize: 18, fontWeight: 600 }}>
              {verdict === 'PASS' ? 'Ready for stock' : verdict === 'FAIL' ? `${fails.length} thing${fails.length > 1 ? 's' : ''} need${fails.length > 1 ? '' : 's'} fixing` : `${open.length} check${open.length > 1 ? 's' : ''} not done yet`}
            </span>
          </div>
          <div className="scores">
            <div className="score"><span>PASS</span><span>{String(passes.length).padStart(2, '0')}</span></div>
            <div className="score"><span>FAIL</span><span>{String(fails.length).padStart(2, '0')}</span></div>
            <div className="score"><span>N/A</span><span>{String(nas.length).padStart(2, '0')}</span></div>
          </div>
        </div>
      </div>

      <main className="result">
        <section className="result-main">
          <Battery battery={battery} size="big" reportFile={battReport} />
          {specDiff && (
            <div className="warn" role="status">
              <b>DIFFERENT LISTING · NOT A FAULT</b>
              <span>{specDiff.differences.join(' · ')}</span>
              <span>This machine is <b style={{ userSelect: 'text' }}>{specDiff.actual}</b></span>
            </div>
          )}

          {(fails.length > 0 || open.length > 0) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span className="eyebrow" style={{ marginBottom: 8 }}>Needs fixing</span>
              {fails.map((r) => (
                <div className="issue" key={r.id}>
                  <b>✕</b>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 17, fontWeight: 700 }}>{r.title}</span>
                    {(r.detail || r.note) && <span style={{ fontSize: 14, color: '#c4c4cc' }}>{[r.detail, r.note].filter(Boolean).join(' · ')}</span>}
                  </div>
                  {r.auto ? <span className="muted" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em' }}>AUTO · RE-SCAN TO RECHECK</span>
                    : <button type="button" className="btn" style={{ minHeight: 40, padding: '0 14px' }} onClick={() => onRetest(r.id)}>RE-TEST</button>}
                </div>
              ))}
              {open.map((r) => (
                <div className="issue" key={r.id} style={{ background: 'var(--panel)', borderColor: 'var(--line)' }}>
                  <b style={{ color: 'var(--muted)' }}>?</b><span style={{ flex: 1, fontSize: 17, fontWeight: 700 }}>{r.title}</span><button type="button" className="btn" style={{ minHeight: 40, padding: '0 14px' }} onClick={() => onRetest(r.id)}>DO IT NOW</button>
                </div>
              ))}
            </div>
          )}

          {autos.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span className="eyebrow" style={{ color: 'var(--muted)' }}>Checked automatically</span>
              <div className="list2">
                {autos.map((r) => (
                  <div key={r.id}><span style={{ color: 'var(--green-text)', fontWeight: 900 }}>✓</span><span>{r.title}</span><span className="v">{r.detail}</span></div>
                ))}
              </div>
            </div>
          )}

          {nas.length > 0 && <span className="muted" style={{ fontSize: 13 }}>Not applicable: {nas.map((r) => r.title).join(', ')}</span>}

          <div className="tool" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span className="eyebrow" style={{ color: 'var(--muted)' }}>Notes for MEPoS</span>
            <pre className="notes">{text}</pre>
          </div>
        </section>

        <aside className="result-side">
          <ListingPanel lookup={lookup} title={title} boxId={boxId} setBoxId={setBoxId} chosen={chosen} />
          <div className="label">
            <Barcode value={boxId} />
            {!boxId && <span style={{ fontSize: 13, color: '#52525b' }}>{lookup && lookup.status === 'exact' ? 'Pick the grade to make the barcode' : 'No barcode yet'}</span>}
            {chosen ? <span className="name">{chosen.boxName}</span> : (listingName || title) && <span className="name">{listingName || title}</span>}
            <input aria-label="Box ID" placeholder="Or type a box ID" value={boxId} onChange={(e) => setBoxId(e.target.value.toUpperCase())} />
          </div>
          <button type="button" className="btn primary" style={{ minHeight: 64, fontSize: 16 }} onClick={doCopy}>{copied ? 'COPIED ✓' : 'COPY NOTES'}</button>
          <button type="button" className="btn" onClick={() => window.print()} disabled={!boxId}>PRINT LABEL</button>
          {saved && saved.ok && <span className="muted" style={{ fontSize: 12, padding: '6px 2px', wordBreak: 'break-all' }}>✓ Report saved to the USB stick: {saved.file}</span>}
          {onReset && (
            <button type="button" className="btn light" style={{ minHeight: 64, fontSize: 16 }} onClick={onReset} disabled={open.length > 0}>
              {resetAt ? 'RESET STARTED ✓' : 'READY FOR SALE: FACTORY RESET ▶'}
            </button>
          )}
          <button type="button" className="btn" onClick={onBack}>← BACK TO CHECKS</button>
          {items && <button type="button" className="btn" onClick={() => setListOpen(true)}>☰ ALL CHECKS</button>}
          <button type="button" className="btn" onClick={onNew}>NEXT TEST ▶</button>
        </aside>
      </main>
      {listOpen && <Checklist items={items} results={results} onPick={(id) => { setListOpen(false); onRetest(id); }} onClose={() => setListOpen(false)} />}
    </>
  );
}
