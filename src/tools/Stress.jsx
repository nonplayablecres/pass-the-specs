import { useEffect, useRef, useState } from 'react';
import { SETTINGS } from '../lib/autoChecks.js';

// Runs on every processor core at once, plus a graphics load and a memory check.
// It isn't about raw speed (a cheap laptop will score lower, that's fine).
// It's about stability: no freezes, no crashes, no big slow-down from overheating.

const WORKER = `
let acc = 0;
onmessage = (e) => {
  if (e.data.type === 'mem') {
    let errors = 0;
    try {
      for (let c = 0; c < e.data.chunks; c++) {
        const a = new Float64Array(8 * 1024 * 1024); // 64MB
        for (let i = 0; i < a.length; i++) a[i] = i * 1.5 + c;
        for (let i = 0; i < a.length; i++) if (a[i] !== i * 1.5 + c) errors++;
      }
      postMessage({ type: 'mem', errors });
    } catch (err) { postMessage({ type: 'mem', errors: -1 }); }
    return;
  }
  const end = performance.now() + e.data.ms;
  let ops = 0, last = performance.now();
  while (performance.now() < end) {
    for (let i = 0; i < 20000; i++) acc += Math.sqrt(i * 1.0001) * Math.sin(i);
    ops += 20000;
    const now = performance.now();
    if (now - last >= 250) { postMessage({ type: 'ops', ops }); ops = 0; last = now; }
  }
  postMessage({ type: 'done', acc });
};`;

const FRAG = `precision highp float;
uniform float t; uniform vec2 r;
void main() {
  vec2 c = (gl_FragCoord.xy / r - 0.5) * 3.0 + vec2(-0.5 + 0.1 * sin(t), 0.0);
  vec2 z = vec2(0.0); float n = 0.0;
  for (int i = 0; i < 400; i++) { z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c; if (dot(z, z) > 4.0) break; n += 1.0; }
  float v = n / 400.0;
  gl_FragColor = vec4(v * 0.9, v * 0.1, v * 0.15, 1.0);
}`;

function startGpu(canvas) {
  const gl = canvas.getContext('webgl');
  if (!gl) return null;
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const p = gl.createProgram();
  gl.attachShader(p, sh(gl.VERTEX_SHADER, 'attribute vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }'));
  gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(p);
  gl.useProgram(p);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(p, 'a');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const ut = gl.getUniformLocation(p, 't');
  gl.uniform2f(gl.getUniformLocation(p, 'r'), canvas.width, canvas.height);
  return (t) => { gl.uniform1f(ut, t); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); };
}

const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

export default function Stress({ report, info }) {
  const secs = SETTINGS.stressSeconds;
  const threads = navigator.hardwareConcurrency || 4;
  const [phase, setPhase] = useState('ready'); // ready | running | done
  const [elapsed, setElapsed] = useState(0);
  const [cpu, setCpu] = useState([]); // ops per second, per second
  const [fps, setFps] = useState(0);
  const [hitches, setHitches] = useState(0);
  const [outcome, setOutcome] = useState(null);
  const canvasRef = useRef(null);
  const stopRef = useRef(() => {});

  useEffect(() => () => stopRef.current(), []);

  const run = () => {
    setPhase('running'); setCpu([]); setHitches(0); setOutcome(null);
    const blob = URL.createObjectURL(new Blob([WORKER], { type: 'text/javascript' }));
    const workers = [];
    const perSecond = Array(secs).fill(0);
    let crashed = false;
    let memErrors = null;
    const t0 = performance.now();

    for (let i = 0; i < threads; i++) {
      const w = new Worker(blob);
      w.onerror = () => { crashed = true; };
      w.onmessage = (e) => {
        if (e.data.type === 'ops') {
          const s = Math.floor((performance.now() - t0) / 1000);
          if (s < secs) perSecond[s] += e.data.ops;
        } else if (e.data.type === 'mem') {
          memErrors = e.data.errors;
          w.postMessage({ type: 'cpu', ms: Math.max(1000, secs * 1000 - (performance.now() - t0)) });
        }
      };
      if (i === 0) w.postMessage({ type: 'mem', chunks: 4 }); // 256MB memory check first
      else w.postMessage({ type: 'cpu', ms: secs * 1000 });
      workers.push(w);
    }

    const draw = canvasRef.current ? startGpu(canvasRef.current) : null;
    let raf = 0;
    let lastFrame = performance.now();
    let frames = 0;
    let frameWindow = performance.now();
    let gaps = 0;
    let freezes = 0;
    const fpsLog = [];

    const loop = () => {
      const now = performance.now();
      const gap = now - lastFrame;
      if (gap > 300) gaps++;
      if (gap > 2000) freezes++;
      lastFrame = now;
      if (draw) draw(now / 1000);
      frames++;
      if (now - frameWindow >= 1000) {
        const f = Math.round((frames * 1000) / (now - frameWindow));
        fpsLog.push(f);
        setFps(f);
        frames = 0;
        frameWindow = now;
        const s = Math.floor((now - t0) / 1000);
        setElapsed(s);
        setCpu(perSecond.slice(0, s));
        setHitches(gaps);
      }
      if (now - t0 < secs * 1000) raf = requestAnimationFrame(loop);
      else finish();
    };

    const stop = () => { cancelAnimationFrame(raf); workers.forEach((w) => w.terminate()); URL.revokeObjectURL(blob); };
    stopRef.current = stop;

    const finish = () => {
      stop();
      const series = perSecond.filter((v) => v > 0);
      const early = avg(series.slice(2, 12));
      const late = avg(series.slice(-10));
      const keep = early ? late / early : 1;
      const score = Math.round(avg(series.slice(2)) / 1e6);
      const problems = [];
      if (crashed) problems.push('a test process crashed');
      if (freezes) problems.push(`froze ${freezes} time${freezes > 1 ? 's' : ''} for over 2 seconds`);
      if (memErrors > 0) problems.push(`${memErrors} memory errors`);
      if (memErrors === -1) problems.push('couldn’t allocate test memory');
      if (keep < SETTINGS.stressThrottleFail) problems.push(`slowed to ${Math.round(keep * 100)}% under load (overheating?)`);
      const notes = [];
      if (!problems.length && keep < 0.8) notes.push(`slowed to ${Math.round(keep * 100)}% under load`);
      if (!problems.length && gaps > 5) notes.push(`${gaps} short stutters`);
      const st = info && info.stability;
      if (st && (st.bluescreens || st.unexpectedShutdowns)) notes.push(`history: ${st.bluescreens} blue screens, ${st.unexpectedShutdowns} unexpected shutdowns in 30 days`);
      const summary = `CPU score ${score} (${threads} threads) · ${Math.round(avg(fpsLog))} fps · held ${Math.round(keep * 100)}% speed`;
      const res = problems.length
        ? { status: 'fail', detail: problems.join(', ') + ' · ' + summary }
        : { status: 'pass', detail: summary + (notes.length ? ' · ' + notes.join(', ') : '') };
      setOutcome(res);
      setPhase('done');
      report(res.status, res.detail);
    };

    raf = requestAnimationFrame(loop);
  };

  const max = Math.max(1, ...cpu);
  return (
    <div className="tool">
      <div className="tool-top">
        <span>{threads} THREADS · {secs} SECONDS · CPU + GRAPHICS + MEMORY</span>
        <span className="pixel" style={{ fontSize: 11, color: 'var(--text)' }}>{phase === 'ready' ? '--' : `${String(elapsed).padStart(2, '0')}/${secs}`}</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'stretch' }}>
        <canvas ref={canvasRef} width="480" height="270" style={{ width: 320, height: 180, background: '#000', border: '1px solid var(--line)' }} aria-label="Graphics load" />
        <div style={{ flex: '1 1 280px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="stress-bars" role="img" aria-label="Processor speed over time">
            {Array.from({ length: secs }, (_, i) => <span key={i} style={{ height: cpu[i] ? `${Math.max(4, (cpu[i] / max) * 100)}%` : 2 }} />)}
          </div>
          <div style={{ display: 'flex', gap: 24, fontSize: 13, color: 'var(--muted)' }}>
            <span>GRAPHICS <b className="pixel" style={{ color: 'var(--text)', fontSize: 11 }}>{fps}</b> FPS</span>
            <span>STUTTERS <b className="pixel" style={{ color: hitches > 5 ? 'var(--amber)' : 'var(--text)', fontSize: 11 }}>{hitches}</b></span>
          </div>
          {phase === 'ready' && <button type="button" className="btn primary" onClick={run}>▶ START STRESS TEST</button>}
          {phase === 'running' && <span className="muted" style={{ fontSize: 14 }}>Running… leave the machine alone. Fans getting loud is normal.</span>}
          {outcome && <div className={outcome.status === 'pass' ? 'hint' : 'warn'}>{outcome.status === 'pass' ? '✓ Ran smoothly. ' : '✕ Problem: '}{outcome.detail}</div>}
          {phase === 'done' && <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={run}>↻ Run again</button>}
        </div>
      </div>
    </div>
  );
}
