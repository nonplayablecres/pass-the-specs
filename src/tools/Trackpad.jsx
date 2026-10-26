import { useRef, useState } from 'react';

// A drawn trackpad that reacts as you use the real one:
// the dot follows your finger, the buttons light up when clicked,
// and arrows light up in the direction you scroll.
export default function Trackpad() {
  const [seen, setSeen] = useState({});
  const [pos, setPos] = useState(null);
  const [down, setDown] = useState({ left: false, right: false });
  const [scroll, setScroll] = useState(null); // 'up' | 'down' | 'left' | 'right'
  const scrollTimer = useRef(0);
  const surface = useRef(null);

  const mark = (k) => setSeen((s) => (s[k] ? s : { ...s, [k]: true }));

  const onMove = (e) => {
    const r = surface.current.getBoundingClientRect();
    setPos({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
    mark('move');
  };
  const onDown = (e) => {
    const side = e.button === 2 ? 'right' : 'left';
    setDown((d) => ({ ...d, [side]: true }));
    mark(side);
  };
  const onUp = (e) => {
    const side = e.button === 2 ? 'right' : 'left';
    setDown((d) => ({ ...d, [side]: false }));
  };
  const onWheel = (e) => {
    let dir = null;
    if (Math.abs(e.deltaY) >= Math.abs(e.deltaX) && e.deltaY !== 0) { dir = e.deltaY > 0 ? 'down' : 'up'; mark('scrollV'); }
    else if (e.deltaX !== 0) { dir = e.deltaX > 0 ? 'right' : 'left'; mark('scrollH'); }
    if (!dir) return;
    setScroll(dir);
    clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(() => setScroll(null), 300);
  };

  const items = [['move', 'Move'], ['left', 'Left click'], ['right', 'Right click'], ['scrollV', 'Scroll up / down'], ['scrollH', 'Scroll sideways']];
  const arrow = (dir, ch) => <span className={'tp-arrow ' + dir + (scroll === dir ? ' on' : '')} aria-hidden="true">{ch}</span>;

  return (
    <div className="tool">
      <div
        className="tp"
        onMouseMove={onMove}
        onMouseDown={onDown}
        onMouseUp={onUp}
        onMouseLeave={() => { setPos(null); setDown({ left: false, right: false }); }}
        onContextMenu={(e) => { e.preventDefault(); mark('right'); }}
        onWheel={onWheel}
      >
        <div className="tp-surface" ref={surface}>
          {pos ? <span className="tp-dot" style={{ left: `${pos.x}%`, top: `${pos.y}%` }} /> : <span className="tp-help">Use the trackpad in here</span>}
          {arrow('up', '▲')}{arrow('down', '▼')}{arrow('left', '◀')}{arrow('right', '▶')}
        </div>
        <div className="tp-buttons">
          <span className={'tp-btn' + (down.left ? ' on' : seen.left ? ' done' : '')}>LEFT</span>
          <span className={'tp-btn' + (down.right ? ' on' : seen.right ? ' done' : '')}>RIGHT</span>
        </div>
      </div>
      <div className="badges">
        {items.map(([k, label]) => <span key={k} className={'badge' + (seen[k] ? ' on' : '')}>{seen[k] ? '✓ ' : ''}{label}</span>)}
      </div>
    </div>
  );
}
