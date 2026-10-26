import { useEffect, useRef, useState } from 'react';
import DevicePicker from '../components/DevicePicker.jsx';
import { useDevices } from '../lib/media.js';

// Plays test tones. Pick the output first when testing headphones or a monitor's speakers.
export default function Speakers() {
  const ctxRef = useRef(null);
  const outputs = useDevices('audiooutput');
  const [sink, setSink] = useState('');
  const [playing, setPlaying] = useState('');

  const ctx = () => {
    if (!ctxRef.current) ctxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    return ctxRef.current;
  };
  useEffect(() => () => { const c = ctxRef.current; ctxRef.current = null; if (c && c.state !== 'closed') c.close().catch(() => {}); }, []);
  useEffect(() => {
    const c = ctx();
    if (c.setSinkId) c.setSinkId(sink || '').catch(() => {});
  }, [sink]);

  const busy = (name, secs) => { setPlaying(name); setTimeout(() => setPlaying((p) => (p === name ? '' : p)), secs * 1000); };

  // pan: -1 = left, 0 = both, 1 = right
  const tone = (pan, name) => {
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
    busy(name, 1.5);
  };

  // Low to high sweep: shows up rattles, crackle and blown drivers
  const sweep = () => {
    const c = ctx();
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.frequency.setValueAtTime(30, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(12000, c.currentTime + 8);
    gain.gain.setValueAtTime(0.0001, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.35, c.currentTime + 0.2);
    gain.gain.setValueAtTime(0.35, c.currentTime + 7.7);
    gain.gain.linearRampToValueAtTime(0, c.currentTime + 8);
    osc.connect(gain).connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + 8);
    busy('sweep', 8);
  };

  const b = (name, text, fn) => <button type="button" className={'btn' + (playing === name ? ' light' : '')} onClick={fn}>{playing === name ? '♪ ' : '▶ '}{text}</button>;

  return (
    <div className="tool" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <DevicePicker label="Play through" devices={outputs} value={sink} onChange={setSink} />
      <div className="tool-row">
        {b('left', 'Left', () => tone(-1, 'left'))}
        {b('right', 'Right', () => tone(1, 'right'))}
        {b('both', 'Both', () => tone(0, 'both'))}
        {b('sweep', 'Sweep (8 sec)', sweep)}
      </div>
    </div>
  );
}
