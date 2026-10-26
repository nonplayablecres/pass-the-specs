import { useEffect, useMemo, useState } from 'react';

// UK (ISO) layouts. Each key: [code, shifted, label, width, part]
// code null = empty space
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

// Full-size desktop keyboard: main block + navigation keys + number pad
const gap = (w) => [null, '', '', w];
const fnRow = (from) => Array.from({ length: 4 }, (_, i) => ['F' + (from + i), '', 'F' + (from + i), 1]);
const FULL_MAIN = [
  [['Escape', '', 'Esc', 1], gap(1), ...fnRow(1), gap(0.5), ...fnRow(5), gap(0.5), ...fnRow(9)],
  ROWS[1], ROWS[2], ROWS[3], ROWS[4],
  [['ControlLeft', '', 'Ctrl', 1.25], ['MetaLeft', '', 'Win', 1.25], ['AltLeft', '', 'Alt', 1.25], ['Space', '', '', 6.25], ['AltRight', '', 'Alt Gr', 1.25], ['MetaRight', '', 'Win', 1.25], ['ContextMenu', '', 'Menu', 1.25], ['ControlRight', '', 'Ctrl', 1.25]]
];
const FULL_NAV = [
  [['PrintScreen', '', 'PrtSc', 1], ['ScrollLock', '', 'ScrLk', 1], ['Pause', '', 'Pause', 1]],
  [['Insert', '', 'Ins', 1], ['Home', '', 'Home', 1], ['PageUp', '', 'PgUp', 1]],
  [['Delete', '', 'Del', 1], ['End', '', 'End', 1], ['PageDown', '', 'PgDn', 1]],
  [gap(3)],
  [gap(1), ['ArrowUp', '', '↑', 1], gap(1)],
  [['ArrowLeft', '', '←', 1], ['ArrowDown', '', '↓', 1], ['ArrowRight', '', '→', 1]]
];
const FULL_PAD = [
  [gap(4)],
  [['NumLock', '', 'Num', 1], ['NumpadDivide', '', '/', 1], ['NumpadMultiply', '', '*', 1], ['NumpadSubtract', '', '-', 1]],
  [['Numpad7', '', '7', 1], ['Numpad8', '', '8', 1], ['Numpad9', '', '9', 1], ['NumpadAdd', '', '+', 1, 'top']],
  [['Numpad4', '', '4', 1], ['Numpad5', '', '5', 1], ['Numpad6', '', '6', 1], ['NumpadAdd', '', '', 1, 'bot']],
  [['Numpad1', '', '1', 1], ['Numpad2', '', '2', 1], ['Numpad3', '', '3', 1], ['NumpadEnter', '', 'Enter', 1, 'top']],
  [['Numpad0', '', '0', 2], ['NumpadDecimal', '', '.', 1], ['NumpadEnter', '', '', 1, 'bot']]
];
const LAYOUTS = {
  laptop: [{ units: 15, rows: ROWS }],
  full: [{ units: 15, rows: FULL_MAIN }, { units: 3, rows: FULL_NAV }, { units: 4, rows: FULL_PAD }]
};

export default function Keyboard({ isMac, full }) {
  const [pressed, setPressed] = useState({});
  const blocks = LAYOUTS[full ? 'full' : 'laptop'];
  const codes = useMemo(() => [...new Set(blocks.flatMap((b) => b.rows.flat().map((k) => k[0])).filter(Boolean))], [blocks]);

  useEffect(() => {
    const down = (e) => {
      if (e.target && e.target.tagName === 'INPUT') return; // let notes be typed
      e.preventDefault();
      e.stopPropagation();
      setPressed((p) => (p[e.code] ? p : { ...p, [e.code]: true }));
    };
    // Print Screen only sends "key up" on Windows
    const up = (e) => { if (e.code === 'PrintScreen') down(e); };
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    return () => { window.removeEventListener('keydown', down, true); window.removeEventListener('keyup', up, true); };
  }, []);

  const done = codes.filter((c) => pressed[c]).length;
  const label = (code, text) => {
    if (!isMac) return text;
    if (code === 'MetaLeft' || code === 'MetaRight') return 'Cmd';
    if (code === 'AltLeft') return 'Option';
    return text;
  };

  return (
    <div className="tool">
      <div className="tool-top">
        <span>{full ? 'UK FULL-SIZE LAYOUT' : 'UK LAYOUT · Fn can’t be detected, click it once you’ve tried it'}</span>
        <span className="pixel" style={{ fontSize: 11, color: 'var(--text)' }}>{done}/{codes.length}</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <div className={"kb-blocks" + (full ? " kb-full" : "")} style={{ minWidth: full ? 860 : 760, gap: full ? 10 : 14 }}>
          {blocks.map((block, bi) => (
            <div className="kb" key={bi} style={{ flex: `${block.units} 1 0`, minWidth: 0 }}>
              {block.rows.map((row, ri) => (
                <div className="kb-row" key={ri}>
                  {row.map(([code, top, text, w, part], ki) => {
                    if (!code) return <span key={'gap' + ki} className={'k-gap' + (ri === 0 ? ' fn' : '')} style={{ flex: `${w} 1 0` }} />;
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
          ))}
        </div>
      </div>
    </div>
  );
}
