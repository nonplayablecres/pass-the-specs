import { DEVICE_TYPES, FEATURES, checksFor } from '../data/checklists.js';
import { SETTINGS, parseListing } from '../lib/autoChecks.js';
import Battery from '../components/Battery.jsx';

const MODEL_HINT = {
  monitor: 'Found automatically when you run the screen tests, or type it',
  drive: 'Found automatically when you pick the drive, or type it',
  headphones: 'e.g. Sony WH-1000XM4',
  microphone: 'e.g. Blue Yeti',
  peripherals: 'e.g. Logitech G502',
  console: 'e.g. PlayStation 5 Disc',
  controller: 'e.g. DualSense'
};

export default function Start({ colour, setColour, scan, detectedType, title, specDiff, device, setDevice, features, setFeatures, model, setModel, listing, setListing, boxId, setBoxId, counts, onStart }) {
  const parsed = parseListing(listing);
  const info = scan.info;
  const current = DEVICE_TYPES.find((d) => d.id === device);
  const isComputer = current && current.list === 'computer';

  return (
    <main className="start">
      <div className="start-inner">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <span className="eyebrow">Ready</span>
          <h1 className="title-xl">New test</h1>
        </div>

        {isComputer && (
          <div className="detected" aria-live="polite">
            <span className={'dot' + (scan.loading ? ' wait' : scan.error ? ' bad' : '')} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
              {scan.loading && <span style={{ fontSize: 17, fontWeight: 700 }}>Scanning this machine…</span>}
              {scan.error && <><span style={{ fontSize: 17, fontWeight: 700 }}>Couldn’t scan this machine</span><span className="muted" style={{ fontSize: 14 }}>{scan.error}. Every check will be manual.</span></>}
              {info && (
                <>
                  <span style={{ fontSize: 17, fontWeight: 700, userSelect: 'text' }}>{title || 'This machine'}</span>
                  <span className="muted" style={{ fontSize: 14 }}>CeX format, built from what’s inside{info.serial ? ' · Serial ' + info.serial : ''}</span>
                </>
              )}
            </div>
            {info && <Battery battery={info.battery} />}
            {info && <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--green-text)' }}>{scan.mock ? 'EXAMPLE DATA' : 'DETECTED'}</span>}
          </div>
        )}

        <div className="types" role="group" aria-label="Device type">
          {DEVICE_TYPES.map((t) => (
            <button key={t.id} type="button" className="type" aria-pressed={device === t.id}
              disabled={!t.ready || (t.list === 'computer' && detectedType && t.id !== detectedType)}
              title={t.list === 'computer' && detectedType && t.id !== detectedType ? `This machine is a ${detectedType}` : undefined}
              onClick={() => setDevice(t.id)}>
              {!t.ready && <span className="soon">SOON</span>}
              {t.id === detectedType && <span className="soon" style={{ color: device === t.id ? 'var(--green)' : 'var(--green-text)' }}>DETECTED</span>}
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" aria-hidden="true"><path d={t.icon} /></svg>
              <span>{t.name}</span>
            </button>
          ))}
        </div>

        {isComputer && (
          <div>
            <label className="field">Listing it’s being bought as (optional)
              <input value={listing} onChange={(e) => setListing(e.target.value)} placeholder="e.g. Dell Latitude 5420/i5-1145G7/16GB Ram/256GB SSD/B" />
              {parsed && (
                <span className="parsed">
                  {parsed.unreadable ? <span className="tag">Couldn’t read a spec from that</span> : (
                    <>
                      {parsed.cpu && <span className="tag">{parsed.cpu}</span>}
                      {parsed.ramGB && <span className="tag">{parsed.ramGB}GB RAM</span>}
                      {parsed.storageGB && <span className="tag">{parsed.storageGB >= 1000 ? parsed.storageGB / 1000 + 'TB' : parsed.storageGB + 'GB'} {parsed.storageType}</span>}
                      {parsed.gpu && <span className="tag">{parsed.gpu}</span>}
                      {parsed.grade && <span className="tag">Grade {parsed.grade}</span>}
                    </>
                  )}
                </span>
              )}
            </label>
          </div>
        )}

        {!isComputer && current && current.ready && (
          <div>
            <label className="field">Model (optional, for the CeX listing)
              <input value={model} onChange={(e) => setModel(e.target.value)} placeholder={MODEL_HINT[device] || 'e.g. the model name on the box or label'} />
            </label>
          </div>
        )}

        {FEATURES[device] && (
          <div className="field">What does it have?
            <div className="grades" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))' }}>
              {FEATURES[device].map((f) => (
                <button key={f.id} type="button" className={'grade feature' + (features[f.id] ? ' on' : '')} aria-pressed={!!features[f.id]} onClick={() => setFeatures({ ...features, [f.id]: !features[f.id] })}>
                  <span style={{ fontSize: 14 }}>{features[f.id] ? '✓ ' : ''}{f.name}</span>
                </button>
              ))}
            </div>
            <span className="muted" style={{ fontSize: 13 }}>Anything not ticked is skipped.</span>
          </div>
        )}

        {isComputer && info && info.platform === 'mac' && (
          <div className="field">Colour
            <div className="grades" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}>
              {SETTINGS.macColours.map(([code, name]) => (
                <button key={code} type="button" className={'grade' + (colour === code ? ' on' : '')} aria-pressed={colour === code} onClick={() => setColour(colour === code ? '' : code)}>
                  <span style={{ fontSize: 13 }}>{name}</span>
                  <span className="pixel" style={{ fontSize: 9 }}>{code}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {isComputer && specDiff && (
          <div className="warn" role="status">
            <b>DIFFERENT LISTING</b>
            <span>This machine doesn’t match that listing: {specDiff.differences.join(' · ')}.</span>
            <span>It’s actually <b style={{ userSelect: 'text' }}>{specDiff.actual}</b>. Not a fault, just pick the right listing.</span>
          </div>
        )}

        <button type="button" className="btn primary big" onClick={onStart} disabled={!current || !current.ready || (isComputer && scan.loading)}>
          <span>START {current ? current.name.toUpperCase() : ''} TEST</span>
          <span className="pixel" style={{ fontSize: 14 }}>▶</span>
        </button>

        <span className="muted" style={{ fontSize: 14 }}>
          {checksFor(device).length ? `${counts.manual} quick checks` : ''}
          {counts.auto ? ` · ${counts.auto} done automatically` : ''}
          {counts.na ? ` · ${counts.na} skipped (not on this device)` : ''}
        </span>
      </div>
    </main>
  );
}
