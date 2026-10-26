import { useEffect, useRef, useState } from 'react';

// Headphone / remote buttons. They arrive as media keys.
// Volume keys may change the computer's volume instead of reaching the app,
// so any button can also be clicked to mark it by hand.
const BUTTONS = [
  ['play', 'Play / pause', ['MediaPlayPause', 'MediaPlay', 'MediaPause']],
  ['next', 'Next', ['MediaTrackNext']],
  ['prev', 'Previous', ['MediaTrackPrevious']],
  ['up', 'Volume +', ['AudioVolumeUp']],
  ['down', 'Volume −', ['AudioVolumeDown']],
  ['mute', 'Mute', ['AudioVolumeMute', 'MicrophoneToggle']]
];

export default function Media() {
  const [seen, setSeen] = useState({});
  const [flash, setFlash] = useState('');
  const audioRef = useRef(null);
  const mark = (id) => {
    setSeen((s) => (s[id] ? s : { ...s, [id]: true }));
    setFlash(id);
    setTimeout(() => setFlash((f) => (f === id ? '' : f)), 300);
  };

  useEffect(() => {
    const onKey = (e) => {
      const hit = BUTTONS.find(([, , keys]) => keys.includes(e.key) || keys.includes(e.code));
      if (hit) { e.preventDefault(); mark(hit[0]); }
    };
    window.addEventListener('keydown', onKey, true);

    // Headsets often send play / next to whatever is playing, so play near-silence
    // and listen through the media session as well.
    const ms = navigator.mediaSession;
    let audio = null;
    if (ms) {
      try {
        const ctx = new AudioContext();
        const dest = ctx.createMediaStreamDestination();
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        g.gain.value = 0.0001;
        osc.connect(g).connect(dest);
        osc.start();
        audio = new Audio();
        audio.srcObject = dest.stream;
        audio.play().catch(() => {});
        audioRef.current = { audio, ctx };
        const set = (action, id) => { try { ms.setActionHandler(action, () => mark(id)); } catch { /* not supported */ } };
        set('play', 'play'); set('pause', 'play'); set('nexttrack', 'next'); set('previoustrack', 'prev');
        ms.playbackState = 'playing';
      } catch { /* no audio */ }
    }
    return () => {
      window.removeEventListener('keydown', onKey, true);
      if (ms) ['play', 'pause', 'nexttrack', 'previoustrack'].forEach((a) => { try { ms.setActionHandler(a, null); } catch { /* ignore */ } });
      if (audioRef.current) { audioRef.current.audio.pause(); if (audioRef.current.ctx.state !== 'closed') audioRef.current.ctx.close().catch(() => {}); audioRef.current = null; }
    };
  }, []);

  return (
    <div className="tool">
      <div className="tool-top">
        <span>PRESS EACH BUTTON ON THE HEADPHONES · click one to mark it by hand</span>
        <span className="pixel" style={{ fontSize: 11, color: 'var(--text)' }}>{Object.keys(seen).length}</span>
      </div>
      <div className="grades" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
        {BUTTONS.map(([id, name]) => (
          <button key={id} type="button" className={'grade' + (flash === id ? ' flash' : seen[id] ? ' on' : '')} aria-pressed={!!seen[id]} onClick={() => setSeen((s) => ({ ...s, [id]: !s[id] }))}>
            <span style={{ fontSize: 14 }}>{seen[id] ? '✓ ' : ''}{name}</span>
          </button>
        ))}
      </div>
      <span className="muted" style={{ fontSize: 13, display: 'block', marginTop: 10 }}>Only press the buttons this pair actually has.</span>
    </div>
  );
}
