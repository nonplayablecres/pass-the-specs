import { useEffect, useRef, useState } from 'react';
import DevicePicker from '../components/DevicePicker.jsx';
import { accessHelp, openMedia, useDevices } from '../lib/media.js';

// Level meter, record + play back, and the "quiet level" (background hiss).
const toDb = (rms) => (rms > 0 ? Math.max(-90, 20 * Math.log10(rms)) : -90);
const QUIET_OK = -60; // quieter than this = clean
const QUIET_BAD = -45; // louder than this when silent = hiss / hum

export default function Mic() {
  const [level, setLevel] = useState(0);
  const [quiet, setQuiet] = useState(null);
  const [error, setError] = useState('');
  const [state, setState] = useState('idle'); // idle | recording | playing
  const [attempt, setAttempt] = useState(0);
  const [input, setInput] = useState('');
  const inputs = useDevices('audioinput');
  const streamRef = useRef(null);

  useEffect(() => {
    let raf = 0;
    let ctx = null;
    let stopped = false;
    const history = [];
    setError('');
    setQuiet(null);
    const audio = input ? { deviceId: { exact: input }, echoCancellation: false, noiseSuppression: false, autoGainControl: false } : { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
    openMedia('microphone', { audio }).then((stream) => {
      if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
      streamRef.current = stream;
      ctx = new AudioContext();
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const data = new Float32Array(analyser.fftSize);
      let frame = 0;
      const tick = () => {
        analyser.getFloatTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
        const rms = Math.sqrt(sum / data.length);
        setLevel(Math.min(1, rms * 6));
        // Quiet level = the quietest moments over the last ~4 seconds
        history.push(toDb(rms));
        if (history.length > 240) history.shift();
        if (++frame % 15 === 0 && history.length > 60) {
          const sorted = [...history].sort((a, b) => a - b);
          setQuiet(sorted[Math.floor(sorted.length * 0.1)]);
        }
        raf = requestAnimationFrame(tick);
      };
      tick();
    }).catch((err) => { if (!stopped) setError(err.message === 'missing' ? 'No microphone found. Plug it in and press Try again.' : accessHelp('microphone')); });
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      if (ctx && ctx.state !== 'closed') ctx.close().catch(() => {});
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [attempt, input]);

  const record = () => {
    if (!streamRef.current) return;
    const rec = new MediaRecorder(streamRef.current);
    const chunks = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    rec.onstop = () => {
      const a = new Audio(URL.createObjectURL(new Blob(chunks)));
      setState('playing');
      a.onended = () => setState('idle');
      a.play();
    };
    setState('recording');
    rec.start();
    setTimeout(() => rec.stop(), 3000);
  };

  const picker = <DevicePicker label="Microphone" devices={inputs} value={input} onChange={setInput} />;
  if (error) {
    return (
      <div className="tool" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {picker}
        <div className="warn">{error}<button type="button" className="btn" style={{ alignSelf: 'flex-start', minHeight: 40, marginTop: 6 }} onClick={() => setAttempt((a) => a + 1)}>Try again</button></div>
      </div>
    );
  }
  const lit = Math.round(level * 20);
  const silent = quiet != null && quiet <= -89 && level < 0.01; // nothing at all coming in: muted or not working
  const quietCls = quiet == null ? '' : silent ? 'bad' : quiet <= QUIET_OK ? 'ok' : quiet >= QUIET_BAD ? 'bad' : 'meh';
  return (
    <div className="tool" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {picker}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
        <div className="meter" role="img" aria-label={`Microphone level ${Math.round(level * 100)}%`}>
          {Array.from({ length: 20 }, (_, i) => <span key={i} className={i < lit ? (i < 14 ? 'g' : i < 17 ? 'y' : 'r') : ''} />)}
        </div>
        <button type="button" className="btn" onClick={record} disabled={state !== 'idle'}>
          {state === 'recording' ? '● Recording…' : state === 'playing' ? '▶ Playing back' : '● Record 3 sec + play back'}
        </button>
        <span className={'quiet ' + quietCls} title="How loud it is when nobody is talking. Lower is better.">
          QUIET LEVEL <b className="pixel">{quiet == null ? '…' : Math.round(quiet) + ' dB'}</b>
          <small>{quiet == null ? 'measuring' : silent ? 'no sound at all (muted?)' : quietCls === 'ok' ? 'clean' : quietCls === 'bad' ? 'hiss / hum' : 'a little noisy'}</small>
        </span>
      </div>
    </div>
  );
}
