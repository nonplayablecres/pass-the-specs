import { useEffect, useRef, useState } from 'react';

export default function Camera() {
  const videoRef = useRef(null);
  const [cams, setCams] = useState([]);
  const [current, setCurrent] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let stream = null;
    let cancelled = false;
    const constraints = { video: current ? { deviceId: { exact: current } } : true };
    navigator.mediaDevices.getUserMedia(constraints).then(async (s) => {
      if (cancelled) { s.getTracks().forEach((t) => t.stop()); return; }
      stream = s;
      if (videoRef.current) videoRef.current.srcObject = s;
      const all = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
      setCams(all);
      if (!current && all[0]) setCurrent(s.getVideoTracks()[0]?.getSettings().deviceId || all[0].deviceId);
      setError('');
    }).catch(() => setError('No camera found, or access was blocked.'));
    return () => { cancelled = true; if (stream) stream.getTracks().forEach((t) => t.stop()); };
  }, [current]);

  if (error) return <div className="hint">{error}</div>;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
      <video ref={videoRef} className="video" autoPlay playsInline muted />
      {cams.length > 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {cams.map((c, i) => (
            <button key={c.deviceId} type="button" className={'btn' + (c.deviceId === current ? ' light' : '')} onClick={() => setCurrent(c.deviceId)}>
              {c.label ? c.label.replace(/\(.*\)/, '').trim().slice(0, 24) : 'Camera ' + (i + 1)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
