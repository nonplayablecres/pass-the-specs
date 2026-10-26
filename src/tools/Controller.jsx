import { useEffect, useRef, useState } from 'react';

// Controller tester.
// - Draws the controller with labels for its brand (PlayStation, Xbox, Nintendo).
// - Each button turns red while held and green once it has been tested.
// - Sticks: moving them is fine. Drift is only judged when the stick is let go
//   and has settled. "Full range" ticks once the stick reaches all four edges.

const DRIFT = 0.1; // resting further than this from centre = drift
const EDGE = 0.85; // how far counts as reaching the edge

const LABELS = {
  ps: { 0: '✕', 1: '○', 2: '□', 3: '△', 4: 'L1', 5: 'R1', 6: 'L2', 7: 'R2', 8: 'Create', 9: 'Options', 10: 'L3', 11: 'R3', 16: 'PS', 17: 'Touchpad' },
  xbox: { 0: 'A', 1: 'B', 2: 'X', 3: 'Y', 4: 'LB', 5: 'RB', 6: 'LT', 7: 'RT', 8: 'View', 9: 'Menu', 10: 'LS', 11: 'RS', 16: 'Xbox', 17: 'Share' },
  nintendo: { 0: 'B', 1: 'A', 2: 'Y', 3: 'X', 4: 'L', 5: 'R', 6: 'ZL', 7: 'ZR', 8: '−', 9: '+', 10: 'LS', 11: 'RS', 16: 'Home', 17: 'Capture' }
};
const DPAD = { 12: '▲', 13: '▼', 14: '◀', 15: '▶' };

function brandOf(id) {
  const s = String(id || '').toLowerCase();
  if (/054c|sony|playstation|dualsense|dualshock|wireless controller/.test(s)) return 'ps';
  if (/057e|nintendo|pro controller|joy-con/.test(s)) return 'nintendo';
  return 'xbox';
}

// Pick the controller that's actually live: some pads (PlayStation especially)
// show up in two slots, and the stale one never changes.
function livePad() {
  const pads = [...(navigator.getGamepads ? navigator.getGamepads() : [])].filter((g) => g && g.connected);
  if (!pads.length) return null;
  return pads.sort((a, b) => b.timestamp - a.timestamp)[0];
}

function newStick() {
  return { x: 0, y: 0, still: 0, lastX: 0, lastY: 0, rest: null, moved: false, edges: {}, trail: [] };
}

function updateStick(s, x, y, now) {
  const moving = Math.abs(x - s.lastX) > 0.01 || Math.abs(y - s.lastY) > 0.01;
  if (moving) { s.still = now; if (Math.hypot(x, y) > 0.3) s.moved = true; }
  // Settled near the middle for 0.5s = let go, so measure where it rests
  if (now - s.still > 500 && Math.hypot(x, y) < 0.5) s.rest = Math.hypot(x, y);
  if (x < -EDGE) s.edges.left = true;
  if (x > EDGE) s.edges.right = true;
  if (y < -EDGE) s.edges.up = true;
  if (y > EDGE) s.edges.down = true;
  if (moving) { s.trail.push([x, y]); if (s.trail.length > 160) s.trail.shift(); }
  s.x = x; s.y = y; s.lastX = x; s.lastY = y;
}

function Stick({ name, s, pressed, tested }) {
  const full = ['up', 'down', 'left', 'right'].every((k) => s.edges[k]);
  const drift = s.rest != null && s.rest > DRIFT;
  const ringClass = drift ? 'bad' : s.rest != null ? 'ok' : '';
  const toXY = ([x, y]) => `${60 + x * 52},${60 + y * 52}`;
  return (
    <div className="stick">
      <svg width="130" height="130" viewBox="0 0 120 120" role="img" aria-label={`${name}: ${drift ? 'drift' : 'no drift'}, ${full ? 'full range' : 'range not finished'}`}>
        <circle cx="60" cy="60" r="56" className={'ring ' + ringClass + (pressed ? ' pressed' : '')} />
        <circle cx="60" cy="60" r={DRIFT * 52} className="deadzone" />
        {s.trail.length > 1 && <polyline points={s.trail.map(toXY).join(' ')} className="trail" />}
        <rect x={60 + s.x * 52 - 7} y={60 + s.y * 52 - 7} width="14" height="14" className="dot" />
      </svg>
      <span className="stick-name">{name}{tested ? ' · CLICK ✓' : ''}</span>
      <span className={'stick-state ' + (drift ? 'bad' : s.rest != null ? 'ok' : '')}>
        {drift ? `DRIFT (rests at ${s.rest.toFixed(2)})` : s.rest != null ? `No drift (${s.rest.toFixed(2)})` : 'Let go to check drift'}
      </span>
      <span className={'stick-state ' + (full ? 'ok' : '')}>{full ? 'Full range ✓' : 'Push to every edge'}</span>
    </div>
  );
}

export default function Controller() {
  const [, setFrame] = useState(0);
  const pad = useRef(null);
  const seen = useRef({});
  const sticks = useRef({ left: newStick(), right: newStick() });
  const raf = useRef(0);

  useEffect(() => {
    const loop = () => {
      const gp = livePad();
      const now = performance.now();
      if (gp) {
        const buttons = gp.buttons.map((b) => (b.pressed || b.value > 0.3 ? Math.max(b.value, 1) : b.value));
        buttons.forEach((v, i) => { if (v > 0.3) seen.current[i] = true; });
        updateStick(sticks.current.left, gp.axes[0] || 0, gp.axes[1] || 0, now);
        updateStick(sticks.current.right, gp.axes[2] || 0, gp.axes[3] || 0, now);
        pad.current = { id: gp.id, buttons, values: gp.buttons.map((b) => b.value), gp };
      } else {
        pad.current = null;
      }
      setFrame((f) => (f + 1) % 1e6);
      raf.current = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf.current);
  }, []);

  const p = pad.current;
  if (!p) {
    return <div className="hint">Plug the controller into this computer with a USB cable, then press any button to wake it up.</div>;
  }

  const brand = brandOf(p.id);
  const labels = { ...LABELS[brand], ...DPAD };
  const count = Math.min(18, p.buttons.length);
  const ids = Object.keys(labels).map(Number).filter((i) => i < count && i !== 6 && i !== 7);
  const allIds = [...ids, ...[6, 7].filter((i) => i < count)];
  const done = allIds.filter((i) => seen.current[i]).length;
  const L = sticks.current.left;
  const R = sticks.current.right;
  const sticksDone = [L, R].every((s) => s.rest != null && s.rest <= DRIFT && ['up', 'down', 'left', 'right'].every((k) => s.edges[k]));

  const btn = (i, extra = '') => {
    if (i >= count) return null;
    const cls = ['pb', extra, p.buttons[i] > 0.3 ? 'down' : seen.current[i] ? 'done' : ''].join(' ');
    return <span key={i} className={cls}>{labels[i]}</span>;
  };
  const trigger = (i) => (i < count ? (
    <div className={'trig' + (seen.current[i] ? ' done' : '')}>
      <span>{labels[i]}</span>
      <div className="bar"><div style={{ width: `${Math.round((p.values[i] || 0) * 100)}%` }} /></div>
    </div>
  ) : null);
  const rumble = () => p.gp.vibrationActuator?.playEffect?.('dual-rumble', { duration: 800, strongMagnitude: 1, weakMagnitude: 1 }).catch(() => {});

  return (
    <div className="tool">
      <div className="tool-top">
        <span>{({ ps: 'PLAYSTATION', xbox: 'XBOX', nintendo: 'NINTENDO' })[brand]} · {p.id.replace(/\(.*?\)/g, '').trim().slice(0, 40)}</span>
        <span className="pixel" style={{ fontSize: 11, color: 'var(--text)' }}>{done}/{allIds.length}</span>
      </div>

      <div className="pad-layout">
        <div className="pad-top">
          <div className="pad-side">{trigger(6)}{btn(4, 'wide')}</div>
          <div className="pad-side right">{btn(5, 'wide')}{trigger(7)}</div>
        </div>
        <div className="pad-mid">
          <div className="dpad">{btn(12, 'u')}{btn(14, 'l')}{btn(15, 'r')}{btn(13, 'd')}</div>
          <div className="pad-centre">
            {btn(17, 'wide')}
            <div className="pad-row">{btn(8, 'small')}{btn(16, 'small')}{btn(9, 'small')}</div>
          </div>
          <div className="face">{btn(3, 'u')}{btn(2, 'l')}{btn(1, 'r')}{btn(0, 'd')}</div>
        </div>
        <div className="pad-sticks">
          <Stick name="LEFT STICK" s={L} pressed={p.buttons[10] > 0.3} tested={seen.current[10]} />
          <Stick name="RIGHT STICK" s={R} pressed={p.buttons[11] > 0.3} tested={seen.current[11]} />
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginTop: 14 }}>
        {p.gp.vibrationActuator && <button type="button" className="btn" onClick={rumble}>~ Test rumble</button>}
        <span className="muted" style={{ fontSize: 13, flex: '1 1 260px' }}>
          {done === allIds.length && sticksDone ? '✓ Every button and both sticks tested. Press PASS.' : 'Press every button (they turn green), push each stick to every edge, then let go.'}
        </span>
      </div>
    </div>
  );
}
