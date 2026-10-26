import { useEffect, useRef, useState } from 'react';

// Mouse tester: a drawn mouse that lights up as each part is used,
// plus double-click and polling rate (how many times a second it reports movement).
const PARTS = [
  ['left', 'Left click'], ['right', 'Right click'], ['middle', 'Wheel click'],
  ['up', 'Scroll up'], ['down', 'Scroll down'], ['back', 'Side: back'], ['fwd', 'Side: forward'],
  ['dbl', 'Double-click'], ['move', 'Smooth tracking']
];
const BTN = { 0: 'left', 1: 'middle', 2: 'right', 3: 'back', 4: 'fwd' };

export default function Mouse() {
  const [seen, setSeen] = useState({});
  const [held, setHeld] = useState({});
  const [scroll, setScroll] = useState('');
  const [hz, setHz] = useState(0);
  const [pos, setPos] = useState(null);
  const area = useRef(null);
  const timer = useRef(0);
  const counter = useRef({ n: 0, t: 0, best: 0 });

  const mark = (k) => setSeen((s) => (s[k] ? s : { ...s, [k]: true }));

  useEffect(() => {
    const el = area.current;
    // Side buttons would otherwise go "back" in the app
    const stop = (e) => { if (e.button === 3 || e.button === 4) e.preventDefault(); };
    window.addEventListener('mouseup', stop, true);
    window.addEventListener('auxclick', stop, true);

    // Polling rate: count raw movement reports per second while moving
    const evt = 'onpointerrawupdate' in window ? 'pointerrawupdate' : 'pointermove';
    const onRaw = (e) => {
      const c = counter.current;
      const now = performance.now();
      const n = evt === 'pointermove' && e.getCoalescedEvents ? Math.max(1, e.getCoalescedEvents().length) : 1;
      // A pause in movement starts a new measuring window
      if (now - c.t > 50) { c.start = now; c.n = 0; }
      c.t = now;
      c.n += n;
      const span = now - c.start;
      if (span >= 250) {
        const rate = (c.n / span) * 1000;
        if (rate > c.best) { c.best = rate; setHz(rate); }
        c.start = now; c.n = 0;
      }
    };
    el.addEventListener(evt, onRaw);
    return () => {
      window.removeEventListener('mouseup', stop, true);
      window.removeEventListener('auxclick', stop, true);
      el.removeEventListener(evt, onRaw);
    };
  }, []);

  const onDown = (e) => {
    e.preventDefault();
    const k = BTN[e.button];
    if (!k) return;
    setHeld((h) => ({ ...h, [k]: true }));
    mark(k);
  };
  const onUp = (e) => { const k = BTN[e.button]; if (k) setHeld((h) => ({ ...h, [k]: false })); };
  const onWheel = (e) => {
    if (!e.deltaY) return;
    const dir = e.deltaY < 0 ? 'up' : 'down';
    mark(dir);
    setScroll(dir);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setScroll(''), 250);
  };
  const onMove = (e) => {
    const r = area.current.getBoundingClientRect();
    setPos({ x: e.clientX - r.left, y: e.clientY - r.top });
    if (counter.current.best > 50) mark('move');
  };

  const lit = (k) => (held[k] || scroll === k ? ' down' : seen[k] ? ' done' : '');
  const rate = hz < 10 ? '—' : hz > 700 ? '1000 Hz' : hz > 350 ? '500 Hz' : hz > 180 ? '250 Hz' : '125 Hz';

  return (
    <div className="tool">
      <div className="mouse-test" ref={area} onMouseDown={onDown} onMouseUp={onUp} onWheel={onWheel} onMouseMove={onMove}
        onDoubleClick={() => mark('dbl')} onContextMenu={(e) => e.preventDefault()} onMouseLeave={() => { setPos(null); setHeld({}); }}>
        {pos && <span className="tp-dot" style={{ left: pos.x, top: pos.y }} />}
        <svg className="mouse-svg" viewBox="0 0 120 190" aria-hidden="true">
          <path className={'mp' + lit('left')} d="M58 8 C30 8 14 26 14 56 V78 H58 Z" />
          <path className={'mp' + lit('right')} d="M62 8 C90 8 106 26 106 56 V78 H62 Z" />
          <rect className={'mp wheel' + lit('middle')} x="53" y="24" width="14" height="32" />
          <path className={'mp arrow' + (scroll === 'up' ? ' down' : seen.up ? ' done' : '')} d="M60 12 L66 20 H54 Z" />
          <path className={'mp arrow' + (scroll === 'down' ? ' down' : seen.down ? ' done' : '')} d="M60 68 L66 60 H54 Z" />
          <path className="mp body" d="M14 82 H106 V120 C106 160 88 182 60 182 C32 182 14 160 14 120 Z" />
          <rect className={'mp' + lit('fwd')} x="4" y="90" width="9" height="20" />
          <rect className={'mp' + lit('back')} x="4" y="114" width="9" height="20" />
        </svg>
        <div className="mouse-readout">
          <span className="eyebrow">Polling rate</span>
          <b className="pixel" style={{ fontSize: 16 }}>{rate}</b>
          <span className="muted" style={{ fontSize: 12 }}>Move the mouse quickly in circles</span>
        </div>
      </div>
      <div className="badges">
        {PARTS.map(([k, label]) => <button type="button" key={k} className={'badge' + (seen[k] ? ' on' : '')} onClick={() => setSeen((s) => ({ ...s, [k]: !s[k] }))}>{seen[k] ? '✓ ' : ''}{label}</button>)}
      </div>
      <span className="muted" style={{ fontSize: 13 }}>No side buttons on this mouse? Leave those two. Click a badge to mark it by hand.</span>
    </div>
  );
}
