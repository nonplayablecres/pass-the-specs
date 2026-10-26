import { useCallback, useEffect, useRef, useState } from 'react';
import Keyboard from '../tools/Keyboard.jsx';
import ScreenTest from '../tools/ScreenTest.jsx';
import Speakers from '../tools/Speakers.jsx';
import Mic from '../tools/Mic.jsx';
import Camera from '../tools/Camera.jsx';
import Touch from '../tools/Touch.jsx';
import Trackpad from '../tools/Trackpad.jsx';
import Controller from '../tools/Controller.jsx';
import Photo from '../tools/Photo.jsx';
import Stress from '../tools/Stress.jsx';
import Ports from '../tools/Ports.jsx';
import Card from '../tools/Card.jsx';
import Mobicode from '../tools/Mobicode.jsx';
import Fingerprint from '../tools/Fingerprint.jsx';

function Tool({ check, isMac, info, report }) {
  switch (check.tool) {
    case 'keys': return <Keyboard isMac={isMac} />;
    case 'screen': return <ScreenTest />;
    case 'speaker': return <Speakers />;
    case 'mic': return <Mic />;
    case 'camera': return <Camera />;
    case 'touch': return <Touch />;
    case 'trackpad': return <Trackpad />;
    case 'pad': return <Controller />;
    case 'photo': return <Photo id={check.id} />;
    case 'stress': return <Stress report={report} info={info} />;
    case 'ports': return <Ports />;
    case 'card': return <Card report={report} />;
    case 'mobicode': return <Mobicode info={info} />;
    case 'fingerprint': return <Fingerprint report={report} isMac={isMac} />;
    default: return null;
  }
}

// items: the checks that need a person. Anything not applicable was already
// detected and skipped, so the only answers are Pass or Fail.
export default function Runner({ items, results, setResult, setNote, onFinish, isMac, info, startAt }) {
  const firstOpen = items.findIndex((c) => !results[c.id]);
  const jump = startAt ? items.findIndex((c) => c.id === startAt) : -1;
  const [idx, setIdx] = useState(jump !== -1 ? jump : firstOpen === -1 ? items.length : firstOpen);
  const [listOpen, setListOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const check = items[idx];
  const resultsRef = useRef(results);
  resultsRef.current = results;

  const goNext = useCallback((fromIdx, justAnswered) => {
    const open = (c) => c.id !== justAnswered && !resultsRef.current[c.id];
    const after = items.findIndex((c, i) => i > fromIdx && open(c));
    const before = items.findIndex((c, i) => i < fromIdx && open(c));
    setIdx(after !== -1 ? after : before !== -1 ? before : items.length);
    setNoteOpen(false);
  }, [items]);

  const answer = (status) => {
    setResult(check.id, status);
    goNext(idx, check.id);
  };

  // Built-in tools can record a result themselves (stress test, memory card)
  const checkId = check ? check.id : null;
  const report = useCallback((status, detail, opts) => {
    if (!checkId) return;
    setResult(checkId, status, detail);
    if (opts && opts.advance) setTimeout(() => goNext(idx, checkId), 900);
  }, [checkId, idx, goNext, setResult]);

  // Shortcuts: Enter = pass, F = fail, Backspace = previous.
  // Turned off on the keyboard test so every key can be tested.
  useEffect(() => {
    if (!check || check.tool === 'keys') return undefined;
    const onKey = (e) => {
      if (e.target && e.target.tagName === 'INPUT') return;
      if (e.key === 'Enter') { e.preventDefault(); answer('pass'); }
      else if (e.key === 'f' || e.key === 'F') answer('fail');
      else if (e.key === 'Backspace') setIdx((i) => Math.max(0, i - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const r = check ? results[check.id] : null;

  return (
    <>
      <nav className="progress" aria-label="Progress">
        {items.map((c, i) => {
          const res = results[c.id];
          const cls = ['seg', i === idx ? 'current' : res ? res.status : ''].join(' ');
          return <button key={c.id} type="button" className={cls} aria-label={`${c.title}${res ? ', ' + res.status : ''}`} onClick={() => { setIdx(i); setNoteOpen(false); }} />;
        })}
      </nav>

      <main className="runner">
        {check ? (
          <div className="card" key={check.id}>
            <div className="card-head">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: '1 1 520px' }}>
                <span className="eyebrow">{check.section}</span>
                <h1 className="card-title">{check.title}</h1>
                <p className="card-how">{check.how}</p>
              </div>
              <span className="counter">{String(idx + 1).padStart(2, '0')}<small>/{String(items.length).padStart(2, '0')}</small></span>
            </div>

            {check.hint && <div className="hint">{check.hint}</div>}
            <Tool check={check} isMac={isMac} info={info} report={report} />

            <div className="answer">
              <button type="button" className={'a-fail' + (r && r.status === 'fail' ? ' on' : '')} onClick={() => answer('fail')}>FAIL <span className="key">F</span></button>
              <button type="button" className={'a-pass' + (r && r.status === 'pass' ? ' on' : '')} onClick={() => answer('pass')}>PASS <span className="key">{check.tool === 'keys' ? '' : 'ENTER'}</span></button>
            </div>

            <div className="card-foot">
              <button type="button" className="link-btn" onClick={() => { setIdx((i) => Math.max(0, i - 1)); setNoteOpen(false); }} disabled={idx === 0}>← Previous</button>
              <button type="button" className="link-btn" onClick={() => setListOpen(true)}>☰ All checks</button>
              {noteOpen || (r && r.note) ? (
                <input className="note-input" autoFocus={noteOpen} placeholder="Note, e.g. small scratch on lid" value={(r && r.note) || ''} onChange={(e) => setNote(check.id, e.target.value)} />
              ) : (
                <button type="button" className="link-btn" onClick={() => setNoteOpen(true)}>+ Add note</button>
              )}
            </div>
          </div>
        ) : (
          <div className="card" style={{ paddingTop: 40 }}>
            <span className="pixel" style={{ fontSize: 12, color: 'var(--green-text)' }}>ALL CLEAR</span>
            <h1 className="card-title">Checks done</h1>
            <div><button type="button" className="btn primary big" style={{ minWidth: 320 }} onClick={onFinish}><span>SEE RESULT</span><span className="pixel" style={{ fontSize: 14 }}>▶</span></button></div>
          </div>
        )}
      </main>

      {listOpen && (
        <div className="checklist-overlay" role="dialog" aria-label="All checks" onClick={() => setListOpen(false)}>
          <div className="checklist" onClick={(e) => e.stopPropagation()}>
            <div className="checklist-head">
              <span className="eyebrow" style={{ color: 'var(--text)' }}>All checks</span>
              <button type="button" className="link-btn" onClick={() => setListOpen(false)}>Close ✕</button>
            </div>
            {items.map((c, i) => {
              const res = results[c.id];
              const st = res ? res.status : null;
              return (
                <button key={c.id} type="button" className={'checklist-row' + (i === idx ? ' current' : '')} onClick={() => { setIdx(i); setNoteOpen(false); setListOpen(false); }}>
                  <span className={'cl-mark ' + (st || '')}>{st === 'pass' ? '✓' : st === 'fail' ? '✕' : i === idx ? '●' : ''}</span>
                  <span style={{ flex: 1, textAlign: 'left' }}>{c.title}</span>
                  <span className="muted" style={{ fontSize: 12 }}>{st === 'pass' ? 'Passed' : st === 'fail' ? 'Failed' : 'To do'}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
