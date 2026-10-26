import { useState } from 'react';
import { bridge } from '../lib/bridge.js';
import { SETTINGS } from '../lib/autoChecks.js';

// Shows the serial and opens Mobicode with it.
// The link isn't set up yet: put the address in SETTINGS.mobicodeUrl
// (src/lib/autoChecks.js), using {serial} where the serial number goes.
export default function Mobicode({ info }) {
  const [copied, setCopied] = useState(false);
  const serial = (info && info.serial) || '';
  const url = SETTINGS.mobicodeUrl ? SETTINGS.mobicodeUrl.replace('{serial}', encodeURIComponent(serial)) : '';
  return (
    <div className="tool" style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
      <div style={{ flex: '1 1 260px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span className="muted" style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.08em' }}>SERIAL NUMBER</span>
        <span className="pixel" style={{ fontSize: 18, userSelect: 'text' }}>{serial || 'NOT FOUND'}</span>
      </div>
      {serial && <button type="button" className="btn" onClick={async () => { await bridge.copy(serial); setCopied(true); }}>{copied ? 'COPIED ✓' : 'COPY SERIAL'}</button>}
      <button type="button" className="btn primary" disabled={!url || !serial} onClick={() => bridge.openUrl(url)}>CHECK ON MOBICODE ↗</button>
      {!url && <span className="muted" style={{ fontSize: 13, flexBasis: '100%' }}>Mobicode link coming soon. For now, check the serial on Mobicode as usual.</span>}
    </div>
  );
}
