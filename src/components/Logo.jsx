// The Pass the Specs stamp logo.
//   <StampLogo />  the main square "PASS / THE / SPECS" stamp (inked by default) - splash, big moments
//   <Lockup />     the clean one-line version - header, sidebar, reports
//   <InkFilter />  put once on the page: gives the inked stamps their worn rubber-stamp edges
// Sizes scale with the `scale` prop (1 = the designed size).

export function Tick({ cross = false }) {
  return (
    <svg className="stamp-tick" viewBox="0 0 100 100" aria-hidden="true">
      <rect x="5" y="5" width="90" height="90" fill="none" stroke="currentColor" strokeWidth="10" />
      {cross
        ? <path d="M 28 28 L 72 72 M 72 28 L 28 72" fill="none" stroke="currentColor" strokeWidth="15" strokeLinecap="square" />
        : <path d="M 24 52 L 42 70 L 78 32" fill="none" stroke="currentColor" strokeWidth="15" strokeLinecap="square" />}
    </svg>
  );
}

export function InkFilter() {
  return (
    <svg width="0" height="0" aria-hidden="true" style={{ position: 'absolute' }}>
      <defs>
        <filter id="pts-ink" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="7" result="grain" />
          <feDisplacementMap in="SourceGraphic" in2="grain" scale="3.4" xChannelSelector="R" yChannelSelector="G" result="rough" />
          <feTurbulence type="fractalNoise" baseFrequency="0.35" numOctaves="3" seed="3" result="blots" />
          <feColorMatrix in="blots" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -9 7.6" result="holes" />
          <feComposite in="rough" in2="holes" operator="in" />
        </filter>
      </defs>
    </svg>
  );
}

export function StampLogo({ scale = 1, inked = true, className = '' }) {
  return (
    <div className={'stamp' + (inked ? ' inked' : '') + (className ? ' ' + className : '')} style={{ fontSize: scale + 'px' }} role="img" aria-label="Pass the Specs">
      <div className="stamp-outer">
        <div className="stamp-inner">
          <span className="stamp-pass">PASS</span>
          <div className="stamp-row">
            <span className="stamp-rule" />
            <span className="stamp-the">THE</span>
            <Tick />
          </div>
          <span className="stamp-specs">SPECS</span>
        </div>
      </div>
    </div>
  );
}

export function Lockup({ scale = 1 }) {
  return (
    <span className="lockup" style={{ fontSize: scale + 'px' }} aria-hidden="true">
      <span className="lockup-in">
        <Tick />
        <span className="lockup-pass">PASS</span>
        <span className="lockup-div" />
        <span className="lockup-sub">THE<br />SPECS</span>
      </span>
    </span>
  );
}

// A big inked word stamp ("PASSED" / "FAILED") for the result screen
export function WordStamp({ word, cross = false, scale = 1 }) {
  return (
    <div className="stamp inked word-stamp" style={{ fontSize: scale + 'px' }} role="img" aria-label={word}>
      <div className="stamp-outer">
        <div className="word-inner">
          <Tick cross={cross} />
          <span className="word-text">{word}</span>
        </div>
      </div>
    </div>
  );
}
