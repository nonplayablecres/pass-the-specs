import { useEffect, useRef, useState } from 'react';
import { bridge } from '../lib/bridge.js';

// Waits for a memory card to show up, then passes the check by itself.
export default function Card({ report }) {
  const [state, setState] = useState({ waiting: true });
  const done = useRef(false);
  const reportRef = useRef(report);
  reportRef.current = report;

  useEffect(() => {
    let stop = false;
    let timer = 0;
    const poll = async () => {
      const res = await bridge.ports();
      if (stop) return;
      if (!res || !res.ok) { setState({ error: (res && res.error) || 'Couldn’t read the card reader' }); return; }
      const card = res.ports.card || {};
      if (card.present && !done.current) {
        done.current = true;
        setState({ found: card.name || 'Memory card' });
        reportRef.current('pass', 'Card read: ' + (card.name || 'memory card'), { advance: true });
        return;
      }
      timer = setTimeout(poll, 2000);
    };
    poll();
    return () => { stop = true; clearTimeout(timer); };
  }, []);

  if (state.error) return <div className="hint">{state.error}. Check it by hand.</div>;
  if (state.found) return <div className="hint">✓ {state.found} detected</div>;
  return <div className="hint"><span className="dot wait" style={{ display: 'inline-block', marginRight: 10 }} />Waiting for a memory card…</div>;
}
