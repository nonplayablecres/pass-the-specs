import { useEffect, useState } from 'react';

export function formatTime(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}

export default function Header({ deviceLabel, startedAt, finishedAt, right, version }) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!startedAt || finishedAt) return undefined;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [startedAt, finishedAt]);

  return (
    <header className="header">
      <div className="header-left">
        <span className="logo" aria-hidden="true">PTS</span>
        <span className="brand">PASS THE SPECS</span>
        {deviceLabel && <><span className="divider" /><span className="device-label">{deviceLabel}</span></>}
      </div>
      <div className="header-right">
        {right}
        {startedAt ? <span className="timer">{formatTime((finishedAt || Date.now()) - startedAt)}</span> : version ? <span className="timer">V{version}</span> : null}
      </div>
    </header>
  );
}
