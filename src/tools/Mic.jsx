import { useEffect, useRef, useState } from 'react';

export default function Mic() {
  const [level, setLevel] = useState(0);
  const [error, setError] = useState('');
  const [state, setState] = useState('idle'); // idle | recording | playing
  const streamRef = useRef(null);

  useEffect(() => {
    let raf = 0;
    let ctx = null;
    let stopped = false;
    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
      streamRef.current = stream;
      ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const data = new Float32Array(analyser.fftSize);
      const tick = () => {
        analyser.getFloatTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
        const rms = Math.sqrt(sum / data.length);
        setLevel(Math.min(1, rms * 6));
        raf = requestAnimationFrame(tick);
      };
      tick();
    }).catch(() => setError('No microphone found, or access was blocked.'));
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      if (ctx) ctx.close();
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const record = () => {
    if (!streamRef.current) return;
    const rec = new MediaRecorder(streamRef.current);
    const chunks = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    rec.onstop = () => {
      const audio = new Audio(URL.createObjectURL(new Blob(chunks)));
      setState('playing');
      audio.onended = () => setState('idle');
      audio.play();
    };
    setState('recording');
    rec.start();
    setTimeout(() => rec.stop(), 3000);
  };

  if (error) return <div className="hint">{error}</div>;
  const lit = Math.round(level * 20);
  return (
    <div className="tool" style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', maxWidth: 680 }}>
      <div className="meter" role="img" aria-label={`Microphone level ${Math.round(level * 100)}%`}>
        {Array.from({ length: 20 }, (_, i) => <span key={i} className={i < lit ? (i < 14 ? 'g' : i < 17 ? 'y' : 'r') : ''} />)}
      </div>
      <button type="button" className="btn" onClick={record} disabled={state !== 'idle'}>
        {state === 'recording' ? '● Recording…' : state === 'playing' ? '▶ Playing back' : '● Record 3 sec + play back'}
      </button>
    </div>
  );
}
