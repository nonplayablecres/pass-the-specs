import { useEffect, useMemo, useState } from 'react';

// UK (ISO) laptop layout. Each key: [code, shifted, label, width, part]
// "code" is what the browser reports when the key is pressed.
const letters = (s) => s.split('').map((c) => ['Key' + c, '', c, 1]);
const ROWS = [
  [['Escape', '', 'Esc', 1], ...Array.from({ length: 12 }, (_, i) => ['F' + (i + 1), '', 'F' + (i + 1), 1]), ['Delete', '', 'Del', 1]],
  [['Backquote', '¬', '`', 1], ['Digit1', '!', '1', 1], ['Digit2', '"', '2', 1], ['Digit3', '£', '3', 1], ['Digit4', '$', '4', 1], ['Digit5', '%', '5', 1], ['Digit6', '^', '6', 1], ['Digit7', '&', '7', 1], ['Digit8', '*', '8', 1], ['Digit9', '(', '9', 1], ['Digit0', ')', '0', 1], ['Minus', '_', '-', 1], ['Equal', '+', '=', 1], ['Backspace', '', 'Backspace', 2]],
  [['Tab', '', 'Tab', 1.5], ...letters('QWERTYUIOP'), ['BracketLeft', '{', '[', 1], ['BracketRight', '}', ']', 1], ['Enter', '', 'Enter', 1.5, 'top']],
  [['CapsLock', '', 'Caps', 1.75], ...letters('ASDFGHJKL'), ['Semicolon', ':', ';', 1], ['Quote', '@', "'", 1], ['Backslash', '~', '#', 1], ['Enter', '', '', 1.25, 'bot']],
  [['ShiftLeft', '', 'Shift', 1.25], ['IntlBackslash', '|', '\\', 1], ...letters('ZXCVBNM'), ['Comma', '<', ',', 1], ['Period', '>', '.', 1], ['Slash', '?', '/', 1], ['ShiftRight', '', 'Shift', 2.75]],
  [['ControlLeft', '', 'Ctrl', 1.25], ['Fn', '', 'Fn', 1], ['MetaLeft', '', 'Win', 1.25], ['AltLeft', '', 'Alt', 1.25], ['Space', '', '', 3.75], ['AltRight', '', 'Alt Gr', 1.25], ['ControlRight', '', 'Ctrl', 1.25], ['ArrowLeft', '', '←', 1], ['ArrowUp', '', '↑', 1], ['ArrowDown', '', '↓', 1], ['ArrowRight', '', '→', 1]]
];

export default function Keyboard({ isMac }) {
  const [pressed, setPressed] = useState({});
  const codes = useMemo(() => [...new Set(ROWS.flat().map((k) => k[0]))], []);

  useEffect(() => {
    const down = (e) => {
      if (e.target && e.target.tagName === 'INPUT') return; // let notes be typed
      e.preventDefault();
      e.stopPropagation();
      setPressed((p) => (p[e.code] ? p : { ...p, [e.code]: true }));
    };
    window.addEventListener('keydown', down, true);
    return () => window.removeEventListener('keydown', down, true);
  }, []);

  const done = codes.filter((c) => pressed[c]).length;
  const label = (code, text) => {
    if (!isMac) return text;
    if (code === 'MetaLeft') return 'Cmd';
    if (code === 'AltLeft') return 'Option';
    return text;
  };

  return (
    <div className="tool">
      <div className="tool-top">
        <span>UK LAYOUT · Fn can’t be detected, click it once you’ve tried it</span>
        <span className="pixel" style={{ fontSize: 11, color: 'var(--text)' }}>{done}/{codes.length}</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <div className="kb">
          {ROWS.map((row, ri) => (
            <div className="kb-row" key={ri}>
              {row.map(([code, top, text, w, part], ki) => {
                const on = !!pressed[code];
                const cls = ['k', ri === 0 ? 'fn' : '', on ? 'on' : '', part === 'top' ? 'enter-top' : '', part === 'bot' ? 'enter-bot' : ''].join(' ');
                return (
                  <button
                    type="button"
                    key={code + ki}
                    className={cls}
                    style={{ flex: `${w} 1 0` }}
                    aria-pressed={on}
                    aria-label={(text || code) + (on ? ' registered' : ' not pressed')}
                    onClick={() => setPressed((p) => ({ ...p, [code]: !p[code] }))}
                  >
                    <span className="top">{top}</span>
                    <span className="main">{label(code, text)}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
