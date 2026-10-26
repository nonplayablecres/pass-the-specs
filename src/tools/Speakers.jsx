import { useRef } from 'react';

export default function Speakers() {
  const ctxRef = useRef(null);
  const ctx = () => {
    if (!ctxRef.current) ctxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    return ctxRef.current;
  };

  // pan: -1 = left, 0 = both, 1 = right
  const tone = (pan) => {
    const c = ctx();
    const osc = c.createOscillator();
    const gain = c.createGain();
    const panner = c.createStereoPanner();
    osc.frequency.value = 440;
    panner.pan.value = pan;
    gain.gain.setValueAtTime(0.0001, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.4, c.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 1.4);
    osc.connect(gain).connect(panner).connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + 1.5);
  };

  // Low to mid sweep: shows up rattles and blown speakers
  const sweep = () => {
    const c = ctx();
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.frequency.setValueAtTime(40, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(400, c.currentTime + 5);
    gain.gain.setValueAtTime(0.5, c.currentTime);
    gain.gain.setValueAtTime(0.5, c.currentTime + 4.8);
    gain.gain.linearRampToValueAtTime(0, c.currentTime + 5);
    osc.connect(gain).connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + 5);
  };

  return (
    <div className="tool-row">
      <button type="button" className="btn" onClick={() => tone(-1)}>▶ Left</button>
      <button type="button" className="btn" onClick={() => tone(1)}>▶ Right</button>
      <button type="button" className="btn" onClick={() => tone(0)}>▶ Both</button>
      <button type="button" className="btn" onClick={sweep}>▶ Bass sweep</button>
    </div>
  );
}
