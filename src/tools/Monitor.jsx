import { useCallback, useEffect, useRef, useState } from 'react';

// Monitor tests (same set as the EIZO monitor test), shown full screen on the chosen screen.
// Click / → = next, ← = back, Space = show or hide the controls, Esc = finish.

const PAGES = {
  pattern: { name: 'Test pattern', look: 'Circles round and complete, fine lines clear, colour bars smooth with no breaks.' },
  black: { name: 'Dead pixels on black', look: 'Any lit dot is a stuck pixel. Also look for light bleeding in from the edges.' },
  white: { name: 'Dead pixels on white', look: 'Any dark dot is a dead pixel.' },
  red: { name: 'Pixels on red', look: 'Any dark or different-coloured dot is a faulty red sub-pixel.' },
  green: { name: 'Pixels on green', look: 'Any dark or different-coloured dot is a faulty green sub-pixel.' },
  blue: { name: 'Pixels on blue', look: 'Any dark or different-coloured dot is a faulty blue sub-pixel.' },
  uniformity: { name: 'Uniformity', look: 'Brightness even across the whole screen. No darker corners, clouds or tinted areas.' },
  distances: { name: 'Colour distances', look: 'Make the two colours as close as you can. A good screen still shows the box.' },
  gradients: { name: 'Gradients', look: '256 steps: smooth, no jumps or banding. 8 steps: every bar clearly different. Step back to look.' },
  sharpness: { name: 'Sharpness', look: 'Text crisp at every size, no blur, shadows or colour fringes.' },
  angle: { name: 'Viewing angle', look: 'Move side to side and up and down. Shapes and colours should barely change.' },
  gamma: { name: 'Gamma', look: 'Slide until the square blends into the stripes (squint). The number is the screen’s gamma, about 2.2 is normal.' },
  response: { name: 'Response time', look: 'Short streaks behind the blocks are normal. Long smears or ghost copies mean a slow panel.' }
};

const GRAD_COLOURS = [['White', [255, 255, 255]], ['Cyan', [0, 255, 255]], ['Magenta', [255, 0, 255]], ['Yellow', [255, 255, 0]], ['Red', [255, 0, 0]], ['Green', [0, 255, 0]], ['Blue', [0, 0, 255]]];
const BACKS = [['Black', '#000'], ['Grey 25%', '#404040'], ['Grey 50%', '#808080'], ['Grey 75%', '#c0c0c0'], ['White', '#fff'], ['Cyan', '#0ff'], ['Magenta', '#f0f'], ['Yellow', '#ff0'], ['Red', '#f00'], ['Green', '#0f0'], ['Blue', '#00f']];
const COMMON_HZ = [50, 60, 75, 85, 90, 100, 120, 144, 165, 170, 175, 180, 200, 240, 280, 300, 360, 480, 500];
let autoModel = ''; // the name this test filled in (replaced if another screen is picked)
const GENERIC = /generic|built-?in|internal|default|^\s*$|^\d+$/i;

// Canvas sized in real screen pixels, so 1-pixel lines really are 1 pixel
function useCanvas(draw, deps) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return undefined;
    const paint = () => {
      const dpr = window.devicePixelRatio || 1;
      c.width = Math.round(window.innerWidth * dpr);
      c.height = Math.round(window.innerHeight * dpr);
      draw(c.getContext('2d'), c.width, c.height, dpr);
    };
    paint();
    window.addEventListener('resize', paint);
    return () => window.removeEventListener('resize', paint);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return <canvas ref={ref} className="mt-canvas" />;
}

function Pattern() {
  return useCanvas((g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#555'; g.lineWidth = 1;
    const step = Math.round(Math.min(w, h) / 10);
    for (let x = (w % step) / 2; x < w; x += step) { g.beginPath(); g.moveTo(Math.round(x) + 0.5, 0); g.lineTo(Math.round(x) + 0.5, h); g.stroke(); }
    for (let y = (h % step) / 2; y < h; y += step) { g.beginPath(); g.moveTo(0, Math.round(y) + 0.5); g.lineTo(w, Math.round(y) + 0.5); g.stroke(); }
    g.strokeStyle = '#fff'; g.lineWidth = Math.max(2, Math.round(w / 1000));
    const r = Math.min(w, h) * 0.45;
    g.beginPath(); g.arc(w / 2, h / 2, r, 0, Math.PI * 2); g.stroke();
    const cr = Math.min(w, h) * 0.12;
    [[cr + 10, cr + 10], [w - cr - 10, cr + 10], [cr + 10, h - cr - 10], [w - cr - 10, h - cr - 10]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, cr, 0, Math.PI * 2); g.stroke(); });
    g.strokeRect(1, 1, w - 2, h - 2);
    // Fine line patches: 1 and 2 pixel lines, both directions
    const ps = Math.round(Math.min(w, h) * 0.12);
    const patch = (x0, y0, size, vertical) => {
      g.fillStyle = '#000'; g.fillRect(x0, y0, ps, ps);
      g.fillStyle = '#fff';
      for (let i = 0; i < ps; i += size * 2) vertical ? g.fillRect(x0 + i, y0, size, ps) : g.fillRect(x0, y0 + i, ps, size);
    };
    const px = Math.round(w / 2 - ps * 2 - 12);
    const py = Math.round(h / 2 - ps / 2);
    patch(px, py, 1, true); patch(px + ps + 8, py, 1, false); patch(px + (ps + 8) * 2, py, 2, true); patch(px + (ps + 8) * 3, py, 2, false);
    // Colour bars
    const bh = Math.round(h * 0.05);
    [[255, 255, 255], [255, 0, 0], [0, 255, 0], [0, 0, 255]].forEach((col, i) => {
      const y0 = Math.round(h * 0.7) + i * bh;
      const x0 = Math.round(w * 0.2);
      const bw = Math.round(w * 0.6);
      const gr = g.createLinearGradient(x0, 0, x0 + bw, 0);
      gr.addColorStop(0, '#000'); gr.addColorStop(1, `rgb(${col.join(',')})`);
      g.fillStyle = gr; g.fillRect(x0, y0, bw, bh - 4);
    });
  }, []);
}

function Gradients({ colour, steps }) {
  return useCanvas((g, w, h) => {
    const [r, gg, b] = GRAD_COLOURS[colour][1];
    for (let i = 0; i < steps; i++) {
      const f = steps === 1 ? 1 : i / (steps - 1);
      g.fillStyle = `rgb(${Math.round(r * f)},${Math.round(gg * f)},${Math.round(b * f)})`;
      const x0 = Math.floor((i * w) / steps);
      g.fillRect(x0, 0, Math.ceil(w / steps) + 1, h);
    }
  }, [colour, steps]);
}

function Gamma({ gamma }) {
  return useCanvas((g, w, h) => {
    // 1-pixel black / white stripes average out to exactly half brightness
    for (let y = 0; y < h; y++) { g.fillStyle = y % 2 ? '#000' : '#fff'; g.fillRect(0, y, w, 1); }
    const v = Math.round(255 * Math.pow(0.5, 1 / gamma));
    const s = Math.round(Math.min(w, h) * 0.35);
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(Math.round(w / 2 - s / 2), Math.round(h / 2 - s / 2), s, s);
  }, [gamma]);
}

function Angle() {
  const greys = ['#202020', '#404040', '#606060', '#808080', '#a0a0a0', '#c0c0c0', '#e0e0e0'];
  const colours = ['#e0b090', '#c08060', '#d04040', '#40a040', '#4060d0', '#d0d040', '#40c0c0'];
  return (
    <div className="mt-fill" style={{ background: '#111', display: 'grid', placeItems: 'center' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2.5vw', width: '86vw' }}>
        {[...greys, ...colours, ...greys.slice().reverse()].map((c, i) => <span key={i} style={{ aspectRatio: '1', borderRadius: '50%', background: c, border: '2px solid #fff' }} />)}
      </div>
    </div>
  );
}

const SAMPLE = 'The quick brown fox jumps over the lazy dog 0123456789. Pack my box with five dozen liquor jugs! Sphinx of black quartz, judge my vow. ';
function Sharpness({ dark, size }) {
  const fg = dark ? '#fff' : '#000';
  return (
    <div className="mt-fill" style={{ background: dark ? '#000' : '#fff', color: fg, padding: '6vh 6vw', overflow: 'hidden' }}>
      {[['Arial, sans-serif', 'normal'], ['Georgia, serif', 'normal'], ['Consolas, Menlo, monospace', 'normal'], ['Arial, sans-serif', 'bold']].map(([font, weight], i) => (
        <p key={i} style={{ fontFamily: font, fontWeight: weight, fontSize: `${size}pt`, lineHeight: 1.35, margin: '0 0 2vh' }}>{SAMPLE.repeat(size < 14 ? 4 : 2)}</p>
      ))}
      <div style={{ display: 'flex', gap: 24, marginTop: '3vh' }}>
        {[6, 7, 8, 9, 10, 11, 12].map((s) => <span key={s} style={{ fontSize: `${s}pt`, fontFamily: 'Arial, sans-serif' }}>{s}pt Aa</span>)}
      </div>
    </div>
  );
}

function Distances({ bg, fg }) {
  return (
    <div className="mt-fill" style={{ background: `rgb(${bg.join(',')})`, display: 'grid', placeItems: 'center' }}>
      <div style={{ width: '40vw', height: '40vh', background: `rgb(${fg.join(',')})` }} />
    </div>
  );
}

// Moving blocks; also measures the refresh rate from how often frames are drawn
function Response({ back, left, right, speed, distance, onHz }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    const g = c.getContext('2d');
    let raf = 0;
    let last = performance.now();
    let x = 0;
    const gaps = [];
    const draw = (now) => {
      const dpr = window.devicePixelRatio || 1;
      if (c.width !== Math.round(window.innerWidth * dpr)) { c.width = Math.round(window.innerWidth * dpr); c.height = Math.round(window.innerHeight * dpr); }
      const dt = now - last;
      last = now;
      if (dt > 0 && dt < 100) {
        gaps.push(dt);
        if (gaps.length > 180) gaps.shift();
        if (gaps.length >= 60 && gaps.length % 30 === 0) onHz(1000 / [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)]);
      }
      const w = c.width;
      const h = c.height;
      const size = Math.round(h * 0.12);
      x = (x + (speed * dpr * dt) / 1000) % (w + size);
      g.fillStyle = BACKS[back][1]; g.fillRect(0, 0, w, h);
      g.fillStyle = BACKS[left][1]; g.fillRect(Math.round(x - size), Math.round(h * 0.3), size, size);
      g.fillStyle = BACKS[right][1]; g.fillRect(Math.round(x - size - distance * dpr), Math.round(h * 0.3 + size + 20), size, size);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [back, left, right, speed, distance, onHz]);
  return <canvas ref={ref} className="mt-canvas" />;
}

const snapHz = (hz) => COMMON_HZ.reduce((best, v) => (Math.abs(v - hz) < Math.abs(best - hz) ? v : best), 60);

export default function Monitor({ pages = Object.keys(PAGES), model, setModel }) {
  const [screens, setScreens] = useState(null); // null = not looked yet, [] = can't list
  const [target, setTarget] = useState(null);
  const [running, setRunning] = useState(false);
  const [idx, setIdx] = useState(0);
  const [controls, setControls] = useState(true);
  const [hz, setHz] = useState(null);
  const [opt, setOpt] = useState({ grey: 50, colour: 0, steps: 256, dark: false, size: 10, gamma: 2.2, back: 0, left: 4, right: 4, speed: 960, distance: 0, bg: [0, 0, 0], fg: [3, 3, 3] });
  const box = useRef(null);
  const set = (k, v) => setOpt((o) => ({ ...o, [k]: v }));
  const onHz = useCallback((v) => setHz(v), []);

  // Fill in the model for the CeX listing, unless the tester typed their own
  const fill = (label) => {
    if (!setModel || GENERIC.test(label || '')) return;
    if (String(model || '').trim() && model !== autoModel) return;
    autoModel = label.trim();
    setModel(autoModel);
  };

  // List the screens (needs the newer app; older ones just use this window's screen)
  const findScreens = useCallback(async () => {
    if (!window.getScreenDetails) { setScreens([]); return; }
    try {
      const d = await window.getScreenDetails();
      const list = d.screens.map((s, i) => ({ s, i, label: s.label || `Screen ${i + 1}`, internal: s.isInternal, primary: s.isPrimary, w: Math.round(s.width * s.devicePixelRatio), h: Math.round(s.height * s.devicePixelRatio) }));
      setScreens(list);
      const ext = list.find((x) => !x.internal && !x.primary) || list.find((x) => !x.internal) || list[0];
      setTarget(ext ? ext.i : null);
      if (ext && !ext.internal) fill(ext.label);
      d.onscreenschange = () => findScreens();
    } catch { setScreens([]); }
  }, [model, setModel]);
  useEffect(() => { findScreens(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const start = () => { setIdx(0); setControls(true); setRunning(true); };
  const stop = () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); setRunning(false); };

  useEffect(() => {
    if (!running || !box.current) return;
    const scr = screens && screens.find((x) => x.i === target);
    box.current.requestFullscreen(scr ? { screen: scr.s } : undefined).catch(() => box.current && box.current.requestFullscreen().catch(() => {}));
  }, [running]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!running) return undefined;
    const next = () => setIdx((i) => { if (i >= pages.length - 1) { stop(); return i; } return i + 1; });
    const onKey = (e) => {
      if (e.target && e.target.tagName === 'INPUT') return;
      e.stopPropagation(); // keep Enter / F from answering the check behind the test
      if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
      else if (e.key === ' ') { e.preventDefault(); setControls((c) => !c); }
      else if (e.key === 'Escape') stop();
    };
    const onFs = () => { if (!document.fullscreenElement) setRunning(false); };
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('fullscreenchange', onFs);
    return () => { window.removeEventListener('keydown', onKey, true); document.removeEventListener('fullscreenchange', onFs); };
  }, [running, pages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const page = pages[idx];
  const next = () => { if (idx >= pages.length - 1) stop(); else setIdx(idx + 1); };
  const solid = { black: '#000', white: '#fff', red: '#f00', green: '#0f0', blue: '#00f' };
  const grey = Math.round((opt.grey / 100) * 255);

  const view = () => {
    switch (page) {
      case 'pattern': return <Pattern />;
      case 'uniformity': return <div className="mt-fill" style={{ background: `rgb(${grey},${grey},${grey})` }} />;
      case 'distances': return <Distances bg={opt.bg} fg={opt.fg} />;
      case 'gradients': return <Gradients colour={opt.colour} steps={opt.steps} />;
      case 'sharpness': return <Sharpness dark={opt.dark} size={opt.size} />;
      case 'angle': return <Angle />;
      case 'gamma': return <Gamma gamma={opt.gamma} />;
      case 'response': return <Response back={opt.back} left={opt.left} right={opt.right} speed={opt.speed} distance={opt.distance} onHz={onHz} />;
      default: return <div className="mt-fill" style={{ background: solid[page] || '#000' }} />;
    }
  };

  const chip = (on, text, fn, key) => <button key={key || text} type="button" className={'mt-chip' + (on ? ' on' : '')} onClick={fn}>{text}</button>;
  const rgb = (k) => (
    <span className="mt-rgb">{['R', 'G', 'B'].map((c, i) => (
      <label key={c}>{c}<input type="number" min="0" max="255" value={opt[k][i]} onChange={(e) => { const v = [...opt[k]]; v[i] = Math.max(0, Math.min(255, +e.target.value || 0)); set(k, v); }} /></label>
    ))}</span>
  );
  const pageControls = () => {
    switch (page) {
      case 'uniformity': return [25, 50, 75].map((v) => chip(opt.grey === v, `${v}%`, () => set('grey', v)));
      case 'gradients': return <>{GRAD_COLOURS.map(([n], i) => chip(opt.colour === i, n, () => set('colour', i)))}<span className="mt-sep" />{[256, 8].map((s) => chip(opt.steps === s, `${s} steps`, () => set('steps', s)))}</>;
      case 'sharpness': return <>{chip(!opt.dark, 'Black on white', () => set('dark', false))}{chip(opt.dark, 'White on black', () => set('dark', true))}<span className="mt-sep" />{[10, 18].map((s) => chip(opt.size === s, `${s}pt`, () => set('size', s)))}</>;
      case 'gamma': return <label className="mt-slider">Gamma <b className="pixel">{opt.gamma.toFixed(2)}</b><input type="range" min="1" max="3" step="0.05" value={opt.gamma} onChange={(e) => set('gamma', +e.target.value)} /></label>;
      case 'distances': return <><span>Background</span>{rgb('bg')}<span>Box</span>{rgb('fg')}{chip(false, 'Reset', () => setOpt((o) => ({ ...o, bg: [0, 0, 0], fg: [3, 3, 3] })))}</>;
      case 'response': return (
        <>
          <select value={opt.back} onChange={(e) => set('back', +e.target.value)} aria-label="Background">{BACKS.map(([n], i) => <option key={n} value={i}>Back: {n}</option>)}</select>
          <select value={opt.left} onChange={(e) => set('left', +e.target.value)} aria-label="Top block">{BACKS.map(([n], i) => <option key={n} value={i}>Top: {n}</option>)}</select>
          <select value={opt.right} onChange={(e) => set('right', +e.target.value)} aria-label="Bottom block">{BACKS.map(([n], i) => <option key={n} value={i}>Bottom: {n}</option>)}</select>
          <select value={opt.speed} onChange={(e) => set('speed', +e.target.value)} aria-label="Speed">{[480, 960, 1920, 3840].map((v) => <option key={v} value={v}>{v} px/s</option>)}</select>
          <label className="mt-slider">Distance <b className="pixel">{opt.distance}</b><input type="range" min="0" max="150" value={opt.distance} onChange={(e) => set('distance', +e.target.value)} /></label>
          <span className="pixel" style={{ fontSize: 11 }}>{hz ? `${snapHz(hz)} HZ` : '… HZ'}</span>
        </>
      );
      default: return null;
    }
  };

  const scr = screens && screens.find((x) => x.i === target);
  return (
    <div className="tool" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {screens && screens.length > 0 ? (
        <div className="picker">
          <span className="eyebrow">Show on</span>
          <div className="picker-row">
            {screens.map((x) => (
              <button key={x.i} type="button" className={'btn' + (target === x.i ? ' light' : '')} onClick={() => { setTarget(x.i); if (!x.internal) fill(x.label); }}>
                {x.label} · {x.w}×{x.h}{x.internal ? ' · this laptop' : x.primary ? ' · main' : ''}
              </button>
            ))}
          </div>
        </div>
      ) : (
        screens && <div className="hint">Drag this window onto the monitor being tested, then press Start. (The newest app version can send the tests there for you.)</div>
      )}
      <div className="tool-row">
        <button type="button" className="btn primary" onClick={start}>▶ START {pages.length > 1 ? `${pages.length} SCREENS` : 'SCREEN TEST'}</button>
        <span className="muted" style={{ fontSize: 13, marginLeft: 8 }}>Click or → for next · ← back · Space hides the controls · Esc to finish</span>
      </div>
      {hz && <span className="badge on" style={{ alignSelf: 'flex-start' }}>Measured refresh rate: {snapHz(hz)} Hz{scr ? ' on ' + scr.label : ''}</span>}
      <ul className="mt-list">
        {pages.map((p) => <li key={p}><b>{PAGES[p].name}:</b> {PAGES[p].look}</li>)}
      </ul>

      {running && (
        <div className={'mt-stage' + (controls ? '' : ' hide-cursor')} ref={box}>
          <div className="mt-view" onClick={next}>{view()}</div>
          {controls && (
            <div className="mt-controls" onClick={(e) => e.stopPropagation()}>
              <div className="mt-head">
                <span className="pixel" style={{ fontSize: 10 }}>{idx + 1}/{pages.length}</span>
                <b>{PAGES[page].name}</b>
                <span className="mt-nav">
                  <button type="button" onClick={() => setIdx(Math.max(0, idx - 1))} disabled={idx === 0}>◀</button>
                  <button type="button" onClick={next}>{idx >= pages.length - 1 ? 'Done' : '▶'}</button>
                  <button type="button" onClick={stop}>✕</button>
                </span>
              </div>
              <span className="mt-look">{PAGES[page].look}</span>
              {pageControls() && <div className="mt-opts">{pageControls()}</div>}
              <span className="mt-tip">Space hides this panel</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
