import { bridge } from './bridge.js';

// Asks for camera / microphone access ONCE and opens the stream.
// Never retries by itself: a refused request shows a message with a Try again button,
// so macOS doesn't keep popping up the permission box.
export async function openMedia(kind, constraints) {
  const access = await bridge.mediaAccess(kind);
  if (access.status === 'denied' || access.status === 'restricted') {
    throw new Error('blocked');
  }
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
