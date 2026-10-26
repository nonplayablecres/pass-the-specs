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
import Checklist from '../components/Checklist.jsx';
import Monitor from '../tools/Monitor.jsx';
import Media from '../tools/Media.jsx';
import Mouse from '../tools/Mouse.jsx';
import Drive from '../tools/Drive.jsx';

function Tool({ check, isMac, info, report, model, setModel }) {
  switch (check.tool) {
    case 'keys': return <Keyboard isMac={isMac} />;
    case 'keysFull': return <Keyboard isMac={isMac} full />;
    case 'monitor': return <Monitor pages={check.pages} model={model} setModel={setModel} />;
    case 'media': return <Media />;
    case 'mouse': return <Mouse />;
    case 'drive': return <Drive step={check.step} report={report} model={model} setModel={setModel} />;
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
export default function Runner({ items, results, setResult, setNote, onFinish, isMac, info, startAt, model, setModel }) {
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
    if (!check || ['keys', 'keysFull', 'media'].includes(check.tool)) return undefined;
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
            <Tool check={check} isMac={isMac} info={info} report={report} model={model} setModel={setModel} />

            <div className="answer">
              <button type="button" className={'a-fail' + (r && r.status === 'fail' ? ' on' : '')} onClick={() => answer('fail')}>FAIL <span className="key">F</span></button>
              <button type="button" className={'a-pass' + (r && r.status === 'pass' ? ' on' : '')} onClick={() => answer('pass')}>PASS <span className="key">{['keys', 'keysFull', 'media'].includes(check.tool) ? '' : 'ENTER'}</span></button>
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
            <div><button type="button" className="btn" style={{ minWidth: 320 }} onClick={() => setListOpen(true)}>☰ ALL CHECKS</button></div>
          </div>
        )}
      </main>

      {listOpen && (
        <Checklist items={items} results={results} currentId={check ? check.id : null}
          onPick={(id) => { setIdx(items.findIndex((c) => c.id === id)); setNoteOpen(false); setListOpen(false); }}
          onClose={() => setListOpen(false)} />
      )}
    </>
  );
}
