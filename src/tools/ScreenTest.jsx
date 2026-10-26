import { useEffect, useState } from 'react';

const COLOURS = [['White', '#ffffff'], ['Black', '#000000'], ['Red', '#ff0000'], ['Green', '#00ff00'], ['Blue', '#0000ff'], ['Grey', '#808080']];

export default function ScreenTest() {
  const [idx, setIdx] = useState(null);

  useEffect(() => {
    const onExit = () => { if (!document.fullscreenElement) setIdx(null); };
    document.addEventListener('fullscreenchange', onExit);
    return () => document.removeEventListener('fullscreenchange', onExit);
  }, []);

  const start = (i) => {
    setIdx(i);
    document.documentElement.requestFullscreen?.().catch(() => {});
  };
  const next = () => {
    if (idx === COLOURS.length - 1) { document.exitFullscreen?.().catch(() => {}); setIdx(null); }
    else setIdx(idx + 1);
  };

  return (
    <>
      <div className="tool-row">
        {COLOURS.map(([name, hex], i) => (
          <button key={name} type="button" className="btn" style={{ background: hex, color: i === 0 || i === 3 ? '#111' : '#fff', minWidth: 96 }} onClick={() => start(i)}>
            {name}
          </button>
        ))}
      </div>
      {idx !== null && (
        <>
          <div className="overlay" style={{ background: COLOURS[idx][1] }} onClick={next} />
          <div className="overlay-help">Click for next colour · Esc to finish</div>
        </>
      )}
    </>
  );
}
