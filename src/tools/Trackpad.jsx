import { useState } from 'react';

export default function Trackpad() {
  const [seen, setSeen] = useState({});
  const mark = (k) => setSeen((s) => (s[k] ? s : { ...s, [k]: true }));
  const items = [['move', 'Move'], ['left', 'Left click'], ['right', 'Right click'], ['scrollV', 'Scroll up/down'], ['scrollH', 'Scroll sideways']];
  return (
    <div className="tool">
      <div
        className="pad-area"
        onPointerMove={() => mark('move')}
        onMouseDown={(e) => mark(e.button === 2 ? 'right' : 'left')}
        onContextMenu={(e) => { e.preventDefault(); mark('right'); }}
        onWheel={(e) => { if (Math.abs(e.deltaY) > 0) mark('scrollV'); if (Math.abs(e.deltaX) > 0) mark('scrollH'); }}
      >
        Use the trackpad in here
      </div>
      <div className="badges">
        {items.map(([k, label]) => <span key={k} className={'badge' + (seen[k] ? ' on' : '')}>{seen[k] ? '✓ ' : ''}{label}</span>)}
      </div>
    </div>
  );
}
