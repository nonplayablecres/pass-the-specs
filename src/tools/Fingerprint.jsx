import { useEffect, useState } from 'react';
import { bridge } from '../lib/bridge.js';

// Mac: asks for a real Touch ID scan and passes by itself.
// Windows: there's no safe way to trigger Windows Hello from here, so it's checked by eye.
export default function Fingerprint({ report, isMac }) {
  const [state, setState] = useState({ checking: isMac });

  useEffect(() => {
    if (!isMac) return;
    bridge.touchId('check').then((r) => setState({ supported: r.supported, ready: r.ready }));
  }, [isMac]);

  if (!isMac) {
    return <div className="hint">Settings → Accounts → Sign-in options → Fingerprint (Windows Hello). Add a finger, check it unlocks, then remove it.</div>;
  }
  if (state.checking) return <div className="hint">Checking Touch ID…</div>;
  if (!state.supported) {
    return <div className="hint">This copy of the app is too old to test Touch ID by itself. Download the latest app. For now: System Settings → Touch ID &amp; Password, check a finger unlocks, then press Pass.</div>;
  }

  const test = async () => {
    const r = await bridge.touchId('prompt');
    if (r.passed) { setState({ ...state, passed: true }); report('pass', 'Touch ID read a fingerprint', { advance: true }); }
    else setState({ ...state, error: r.error || 'Not recognised' });
  };

  return (
    <div className="tool" style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
      <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 15 }}>
        {state.passed ? <span style={{ color: 'var(--green-text)', fontWeight: 700 }}>✓ Touch ID works</span>
          : state.ready ? <span>Press the button, then put a finger on the Touch ID key (top right of the keyboard).</span>
          : <span>No fingerprint is set up yet. Add one in <b>System Settings → Touch ID &amp; Password</b>, then press the button. Remove it again afterwards.</span>}
        {state.error && <span style={{ color: 'var(--red-text)', fontSize: 13 }}>{state.error}</span>}
      </div>
      {!state.passed && <button type="button" className="btn primary" onClick={test}>TEST TOUCH ID</button>}
    </div>
  );
}
