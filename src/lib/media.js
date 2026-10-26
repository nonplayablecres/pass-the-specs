import { useEffect, useState } from 'react';

// Asks for camera / microphone access ONCE and opens the stream.
// Never retries by itself: a refused request shows a message with a Try again button,
// so macOS doesn't keep popping up the permission box.
// The request goes straight through Chromium (one macOS prompt). The engine is
// not asked separately any more: asking twice gave two prompts on unsigned Macs.
export async function openMedia(kind, constraints) {
  try {
    return await navigator.mediaDevices.getUserMedia(constraints);
  } catch (err) {
    throw new Error(err && err.name === 'NotFoundError' ? 'missing' : 'blocked');
  }
}

export function accessHelp(kind) {
  const name = kind === 'camera' ? 'Camera' : 'Microphone';
  const isMac = /Mac/i.test(navigator.platform || navigator.userAgent);
  return isMac
    ? `${name} access is off. Turn it on in System Settings → Privacy & Security → ${name} → Pass the Specs, then press Try again.`
    : `${name} access is off. Turn it on in Settings → Privacy & security → ${name}, then press Try again.`;
}

// Live list of sound outputs / microphones / cameras ('audiooutput' | 'audioinput' | 'videoinput').
// Updates when something is plugged in or out.
export function useDevices(kind) {
  const [list, setList] = useState([]);
  useEffect(() => {
    const md = navigator.mediaDevices;
    if (!md || !md.enumerateDevices) return undefined;
    let alive = true;
    const load = () => md.enumerateDevices().then((all) => {
      if (!alive) return;
      // Skip Windows' duplicate "Default" / "Communications" entries
      setList(all.filter((d) => d.kind === kind && d.deviceId !== 'communications' && d.deviceId !== 'default'));
    }).catch(() => {});
    load();
    md.addEventListener('devicechange', load);
    return () => { alive = false; md.removeEventListener('devicechange', load); };
  }, [kind]);
  return list;
}

export const deviceName = (d, i) => (d.label ? d.label.replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)\s*$/i, '') : `Device ${i + 1}`);
