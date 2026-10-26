import { useState } from 'react';

const CELLS = 60; // 10 x 6

export default function Touch() {
  const [on, setOn] = useState(() => new Set());
  const hit = (e) => {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const i = el && el.dataset ? el.dataset.cell : undefined;
    if (i !== undefined && !on.has(i)) setOn((s) => new Set(s).add(i));
  };
  return (
    <div className="tool">
      <div className="tool-top"><span>DRAG ACROSS EVERY SQUARE</span><span className="pixel" style={{ fontSize: 11, color: 'var(--text)' }}>{on.size}/{CELLS}</span></div>
      <div className="grid-touch" onPointerDown={hit} onPointerMove={(e) => e.buttons || e.pointerType === 'touch' ? hit(e) : null}>
        {Array.from({ length: CELLS }, (_, i) => <div key={i} data-cell={String(i)} className={on.has(String(i)) ? 'on' : ''} />)}
      </div>
    </div>
  );
}
