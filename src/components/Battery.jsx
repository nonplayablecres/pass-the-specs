import { batteryGrade } from '../lib/autoChecks.js';

const COLOURS = { green: 'var(--green-text)', amber: 'var(--amber)', red: 'var(--red-text)' };

// Battery health as a green / amber / red percentage.
// size="small" for the start screen, "big" for the result screen.
export default function Battery({ battery, size = 'small', reportFile }) {
  const g = batteryGrade(battery);
  if (!g) return null;
  const colour = COLOURS[g.tone];
  if (size === 'small') {
    return (
      <span className={'battery-chip ' + g.tone} title="Battery health compared with when it was new">
        <span className="battery-dot" style={{ background: colour }} />
        BATTERY <b className="pixel" style={{ color: colour }}>{g.pct}%</b>
      </span>
    );
  }
  return (
    <div className={'battery-big ' + g.tone}>
      <div className="battery-icon" aria-hidden="true"><div style={{ width: `${g.pct}%`, background: colour }} /></div>
      <div style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span className="eyebrow" style={{ color: colour }}>Battery health · {g.label}</span>
        <span style={{ fontSize: 14, color: 'var(--text-2)' }}>
          Holds {g.pct}% of the charge it did when new{g.cycles ? ` · ${g.cycles} charge cycles` : ''}
        </span>
        {reportFile && <span className="muted" style={{ fontSize: 12, wordBreak: 'break-all' }}>✓ Full battery report saved: {reportFile}</span>}
      </div>
      <span className="pixel" style={{ fontSize: 28, color: colour }}>{g.pct}%</span>
    </div>
  );
}
