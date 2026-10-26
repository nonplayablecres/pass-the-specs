import { useEffect, useRef, useState } from 'react';
import { bridge } from '../lib/bridge.js';

const portName = (loc) => {
  const m = String(loc || '').match(/Port_#0*(\d+)\.Hub_#0*(\d+)/i);
  return m ? `Port ${m[1]} (hub ${m[2]})` : loc || 'USB port';
};

// Polls the machine every few seconds and ticks off each port as something is plugged in.
export default function Ports() {
  const [state, setState] = useState({ loading: true });
  const baseline = useRef(null);
  const seen = useRef(new Map());

  useEffect(() => {
    let stop = false;
    let timer = 0;
    const poll = async () => {
      const res = await bridge.ports();
      if (stop) return;
      if (!res || !res.ok) { setState({ error: (res && res.error) || 'Couldn’t read the ports' }); return; }
      const usb = res.ports.usb || [];
      if (!baseline.current) baseline.current = { ports: new Set(usb.map((u) => u.port)), displays: res.displays };
      usb.forEach((u) => {
        if (u.port && !baseline.current.ports.has(u.port) && !seen.current.has(u.port)) seen.current.set(u.port, u.name);
      });
      setState({ usb: [...seen.current.entries()], displays: res.displays, baseDisplays: baseline.current.displays, eth: res.ports.ethernet || {} });
      timer = setTimeout(poll, 2500);
    };
    poll();
    return () => { stop = true; clearTimeout(timer); };
  }, []);

  if (state.error) return <div className="hint">{state.error}. Test the ports by hand.</div>;
  if (state.loading) return <div className="hint">Reading ports…</div>;
  const extDisplay = state.displays > state.baseDisplays || state.displays > 1;
  return (
    <div className="tool">
      <div className="tool-top"><span>PLUG SOMETHING INTO EACH PORT · TICKS OFF AUTOMATICALLY</span><span className="pixel" style={{ fontSize: 11, color: 'var(--text)' }}>{state.usb.length + 1} USB</span></div>
      <div className="badges" style={{ marginTop: 0 }}>
        <span className="badge on">✓ USB port this stick is in</span>
        {state.usb.map(([port, name]) => <span key={port} className="badge on">✓ {portName(port)} · {name || 'device'}</span>)}
        <span className={'badge' + (extDisplay ? ' on' : '')}>{extDisplay ? '✓ ' : ''}HDMI / DisplayPort screen</span>
        {state.eth.present && <span className={'badge' + (state.eth.up ? ' on' : '')}>{state.eth.up ? '✓ ' : ''}Ethernet cable</span>}
      </div>
      <div className="muted" style={{ fontSize: 13, marginTop: 12 }}>Headphone jack and charging port: check by hand, then press Pass.</div>
    </div>
  );
}
