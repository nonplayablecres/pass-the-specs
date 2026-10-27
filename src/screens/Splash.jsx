import { useEffect, useRef, useState } from 'react';
import { StampLogo } from '../components/Logo.jsx';

// Shown while the app scans the machine at launch, then fades into the start screen.
// The scan is one job, so the steps tick along with time and all finish when it's done.
const STEPS = [
  ['Hardware', 'READING HARDWARE…'],
  ['Battery', 'CHECKING BATTERY…'],
  ['Security', 'CHECKING SECURITY…'],
  ['Drives', 'CHECKING DRIVES…']
];
const MIN_MS = 1400; // long enough to read, never longer than the scan itself needs

export default function Splash({ done, version, update, onFinished }) {
  const [elapsed, setElapsed] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const started = useRef(performance.now());

  useEffect(() => {
    const t = setInterval(() => setElapsed(performance.now() - started.current), 100);
    return () => clearInterval(t);
  }, []);

  const finished = done && elapsed >= MIN_MS;
  useEffect(() => {
    if (!finished) return undefined;
    setLeaving(true);
    const t = setTimeout(onFinished, 450);
    return () => clearTimeout(t);
  }, [finished, onFinished]);

  // Creeps towards 90% while scanning, jumps to 100% when done
  const progress = finished ? 100 : Math.round(90 * (1 - Math.exp(-elapsed / 3500)));
  const current = finished ? STEPS.length : Math.min(STEPS.length - 1, Math.floor(elapsed / 1500));
  const label = finished ? 'READY' : STEPS[current][1];

  return (
    <div className={'splash' + (leaving ? ' leaving' : '')} role="status" aria-live="polite">
      <StampLogo scale={0.92} />
      <div className="splash-side">
        <span className="splash-tag">QUICK TESTS. REAL SPECS.</span>
        <div className="splash-progress">
          <div className="splash-label">
            <span>{label}</span>
            <span className="pixel">{progress}%</span>
          </div>
          <div className="bar big"><div style={{ width: progress + '%', background: 'var(--red)' }} /></div>
        </div>
        <ul className="splash-steps">
          {STEPS.map(([name], i) => {
            const state = finished || i < current ? 'done' : i === current ? 'now' : 'next';
            return (
              <li key={name} className={state}>
                <span>{state === 'done' ? '✓' : state === 'now' ? '●' : '○'} {name}</span>
                <span className="muted">{state === 'done' ? 'done' : state === 'now' ? 'checking' : ''}</span>
              </li>
            );
          })}
        </ul>
      </div>
      <span className="splash-foot left">{update && update.status === 'ready' ? `● UPDATE V${update.version} READY` : '● UP TO DATE'}</span>
      <span className="splash-foot right pixel">V{version}</span>
      <button type="button" className="link-btn splash-skip" onClick={onFinished}>Skip</button>
    </div>
  );
}
