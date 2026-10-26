// Pop-up list of every check with its status. Tap one to go straight to it.
export default function Checklist({ items, results, currentId, onPick, onClose }) {
  return (
    <div className="checklist-overlay" role="dialog" aria-label="All checks" onClick={onClose}>
      <div className="checklist" onClick={(e) => e.stopPropagation()}>
        <div className="checklist-head">
          <span className="eyebrow" style={{ color: 'var(--text)' }}>All checks</span>
          <button type="button" className="link-btn" onClick={onClose}>Close ✕</button>
        </div>
        {items.map((c) => {
          const res = results[c.id];
          const st = res ? res.status : null;
          const here = c.id === currentId;
          return (
            <button key={c.id} type="button" className={'checklist-row' + (here ? ' current' : '')} onClick={() => onPick(c.id)}>
              <span className={'cl-mark ' + (st || '')}>{st === 'pass' ? '✓' : st === 'fail' ? '✕' : here ? '●' : ''}</span>
              <span style={{ flex: 1, textAlign: 'left' }}>{c.title}</span>
              <span className="muted" style={{ fontSize: 12 }}>{st === 'pass' ? 'Passed' : st === 'fail' ? 'Failed' : 'To do'}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
