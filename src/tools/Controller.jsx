import { useEffect, useRef, useState } from 'react';

// Standard gamepad button order (works for PlayStation, Xbox and Switch Pro pads over USB)
const NAMES = ['A / ✕', 'B / ○', 'X / □', 'Y / △', 'LB / L1', 'RB / R1', 'LT / L2', 'RT / R2', 'View / Share', 'Menu / Options', 'L3', 'R3', '↑', '↓', '←', '→', 'Home / PS', 'Touchpad'];
const DRIFT = 0.08; // a resting stick further than this from centre = drift

export default function Controller() {
  const [pad, setPad] = useState(null);
  const [seen, setSeen] = useState({});
  const raf = useRef(0);

  useEffect(() => {
    const loop = () => {
      const gp = [...(navigator.getGamepads ? navigator.getGamepads() : [])].find(Boolean);
      if (gp) {
        const buttons = gp.buttons.map((b) => b.value);
        setPad({ id: gp.id, axes: [...gp.axes], buttons, rumble: !!gp.vibrationActuator, gp });
        setSeen((s) => {
          let changed = false;
          const n = { ...s };
          buttons.forEach((v, i) => { if (v > 0.5 && !n[i]) { n[i] = true; changed = true; } });
          return changed ? n : s;
        });
      } else {
        setPad(null);
      }
      raf.current = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf.current);
  }, []);

  if (!pad) {
    return <div className="hint">Plug the controller into this computer with a USB cable, then press any button.</div>;
  }

  const sticks = [['Left stick', pad.axes[0] || 0, pad.axes[1] || 0, 10], ['Right stick', pad.axes[2] || 0, pad.axes[3] || 0, 11]];
  const count = Math.min(NAMES.length, pad.buttons.length);
  const done = Object.keys(seen).filter((k) => Number(k) < count).length;

  const rumble = () => {
    pad.gp.vibrationActuator?.playEffect?.('dual-rumble', { duration: 800, strongMagnitude: 1, weakMagnitude: 1 }).catch(() => {});
  };

  return (
    <div className="tool">
      <div className="tool-top">
        <span>{pad.id.replace(/\(.*?\)/g, '').trim().slice(0, 50)}</span>
        <span className="pixel" style={{ fontSize: 11, color: 'var(--text)' }}>{done}/{count}</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 28, alignItems: 'center' }}>
        <div className="sticks">
          {sticks.map(([name, x, y]) => {
            const off = Math.hypot(x, y);
            const ok = off < DRIFT;
            return (
              <div className="stick" key={name}>
                <div className={'stick-ring ' + (ok ? 'ok' : 'bad')} role="img" aria-label={`${name} ${ok ? 'centred' : 'off centre'}`}>
                  <div className="stick-dot" style={{ left: `${50 + x * 45}%`, top: `${50 + y * 45}%`, background: ok ? 'var(--green-text)' : 'var(--red)' }} />
                </div>
                <span style={{ color: ok ? 'var(--green-text)' : 'var(--red-text)' }}>{name.toUpperCase()} · {ok ? 'CENTRED' : 'OFF CENTRE ' + off.toFixed(2)}</span>
              </div>
            );
          })}
        </div>
        <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[['L2', 6], ['R2', 7]].map(([n, i]) => (
            <div className="trigger" key={n}><span style={{ width: 24 }}>{n}</span><div className="bar"><div style={{ width: `${Math.round((pad.buttons[i] || 0) * 100)}%` }} /></div></div>
          ))}
          <div className="pad-buttons">
            {NAMES.slice(0, count).map((n, i) => <span key={n} className={(pad.buttons[i] > 0.5 || seen[i]) ? 'on' : ''}>{n}</span>)}
          </div>
          {pad.rumble && <button type="button" className="btn" onClick={rumble}>~ Test rumble</button>}
        </div>
      </div>
      <div className="muted" style={{ fontSize: 13, marginTop: 12 }}>A stick showing OFF CENTRE while you’re not touching it means drift.</div>
    </div>
  );
}
