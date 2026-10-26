import { useEffect, useRef, useState } from 'react';
import { accessHelp, openMedia } from '../lib/media.js';

// Live camera preview. Access is asked for once; switching cameras only
// happens when the tester taps another camera.
export default function Camera() {
  const videoRef = useRef(null);
  const [cams, setCams] = useState([]);
  const [chosen, setChosen] = useState(null); // only changed by the tester
  const [active, setActive] = useState(null); // which camera is showing
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let stream = null;
    let cancelled = false;
    setError('');
    const constraints = { video: chosen ? { deviceId: { exact: chosen } } : true };
    openMedia('camera', constraints).then(async (s) => {
      if (cancelled) { s.getTracks().forEach((t) => t.stop()); return; }
      stream = s;
      if (videoRef.current) videoRef.current.srcObject = s;
      setActive(s.getVideoTracks()[0]?.getSettings().deviceId || chosen);
      const all = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
      if (!cancelled) setCams(all);
    }).catch((err) => { if (!cancelled) setError(err.message === 'missing' ? 'No camera found on this machine.' : accessHelp('camera')); });
    return () => { cancelled = true; if (stream) stream.getTracks().forEach((t) => t.stop()); };
  }, [chosen, attempt]);

  if (error) {
    return (
      <div className="warn">{error}
        <button type="button" className="btn" style={{ alignSelf: 'flex-start', minHeight: 40, marginTop: 6 }} onClick={() => setAttempt((a) => a + 1)}>Try again</button>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
      <video ref={videoRef} className="video" autoPlay playsInline muted />
      {cams.length > 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {cams.map((c, i) => (
            <button key={c.deviceId} type="button" className={'btn' + (c.deviceId === active ? ' light' : '')} onClick={() => setChosen(c.deviceId)}>
              {c.label ? c.label.replace(/\(.*\)/, '').trim().slice(0, 24) : 'Camera ' + (i + 1)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
