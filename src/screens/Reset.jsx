import { useState } from 'react';
import { bridge } from '../lib/bridge.js';

// The very last step: wipe the machine so it's ready for sale.
export default function Reset({ onBack, onStarted, resetAt, onNew, reportText, isMac }) {
  const [error, setError] = useState('');

  const start = async () => {
    if (!window.confirm('This will wipe EVERYTHING on this machine and reinstall the system. Carry on?')) return;
    setError('');
    const t = Date.now();
    onStarted(t);
    const stamp = new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    await bridge.saveReport('LAST-RESET_' + new Date(t).toISOString().slice(0, 16).replace(/[T:]/g, '-'), reportText + `\nFactory reset started ${stamp}`);
    const res = await bridge.factoryReset();
    if (!res || !res.ok) setError((res && res.error) || 'Couldn’t open the reset screen. Start it from Settings instead.');
  };

  const steps = isMac
    ? ['Erase Assistant opens. Follow it through and choose to erase all content and settings.', 'It restarts to the "Hello" setup screen when it’s done.']
    : ['The "Reset this PC" screen opens. Choose Remove everything, then Local reinstall.', 'Pick Clean the drive if it asks (slower, but nothing can be recovered).', 'Take the USB stick out once the reset is under way.'];

  return (
    <main className="runner">
      <div className="card">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <span className="eyebrow">Last step</span>
          <h1 className="card-title">Factory reset</h1>
          <p className="card-how">Everything’s been checked. Wipe the machine so it’s ready for sale.</p>
        </div>

        <div className="tool" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <span>✓ Test report saved to the USB stick (reports folder)</span>
          {steps.map((s, i) => <span key={i} className="muted">{i + 1}. {s}</span>)}
          <span className="muted">Verify data deleted: it should boot to the first-time setup screen. That’s your confirmation.</span>
        </div>

        {error && <div className="warn">{error}</div>}

        <div className="answer">
          <button type="button" className="a-fail" onClick={onBack}>← BACK</button>
          <button type="button" className="a-pass" onClick={start} style={{ background: 'var(--red)', borderColor: 'var(--red)' }}>
            {resetAt ? 'OPEN RESET AGAIN' : 'START FACTORY RESET'}
          </button>
        </div>
        {resetAt && <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={onNew}>Done. Start the next test ▶</button>}
      </div>
    </main>
  );
}
