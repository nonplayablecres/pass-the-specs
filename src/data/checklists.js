// All the testing checks, in the same order as MEPoS.
// Visual inspection is left out on purpose: that's done at the till.
// Edit wording here. Fields:
//   id      - unique, used by the auto-checks in src/lib/autoChecks.js
//   section - heading shown above the title
//   title   - big title on the card
//   how     - one line telling the tester what to do
//   tool    - optional built-in test: photo | keys | keysFull | screen | speaker | mic | camera | touch | trackpad | pad | stress
//             | ports | card | mobicode | fingerprint | monitor | media | mouse | drive
//   pages   - monitor tool: which full-screen tests to show
//   step    - drive tool: health | scan | speed
//   final   - done on the last screen (factory reset), not in the click-through
//
// Example photos: put a picture at public/examples/<id>.jpg (e.g. public/examples/v1.jpg)
// and it will show on any check with tool: 'photo'.

export const DEVICE_TYPES = [
  { id: 'laptop', name: 'Laptop', list: 'computer', ready: true, icon: 'M4 5h16v11H4zM2 19h20' },
  { id: 'desktop', name: 'Desktop', list: 'computer', ready: true, icon: 'M3 4h18v12H3zM8 20h8M12 16v4' },
  { id: 'mac', name: 'Mac', list: 'computer', ready: true, icon: 'M5 4h14v11H5zM3 18h18M10 18v-1h4v1' },
  { id: 'controller', name: 'Controller', list: 'controller', ready: true, icon: 'M7 9h10a4 4 0 014 4v1a3 3 0 01-5.5 1.6L14 14h-4l-1.5 1.6A3 3 0 013 14v-1a4 4 0 014-4zM8 12v3M6.5 13.5h3' },
  { id: 'monitor', name: 'Monitor', list: 'monitor', ready: true, icon: 'M3 4h18v12H3zM12 16v4M8 20h8' },
  { id: 'headphones', name: 'Headphones', list: 'headphones', ready: true, icon: 'M4 14v-2a8 8 0 0116 0v2M4 14h3v6H4zM17 14h3v6h-3z' },
  { id: 'microphone', name: 'Microphone', list: 'microphone', ready: true, icon: 'M9 3h6v10H9zM5 11a7 7 0 0014 0M12 18v3M8 21h8' },
  { id: 'keyboard', name: 'Keyboard', list: 'keyboard', ready: true, icon: 'M2 8h20v9H2zM6 11h.01M10 11h.01M14 11h.01M18 11h.01M7 14h10' },
  { id: 'mouse', name: 'Mouse', list: 'mouse', ready: true, icon: 'M12 3a6 6 0 016 6v6a6 6 0 01-12 0V9a6 6 0 016-6zM12 3v6M6 9h12' },
  { id: 'drive', name: 'Drive', list: 'drive', ready: true, icon: 'M3 6h18v12H3zM7 14h.01M11 14h6M3 10h18' },
  { id: 'tablet', name: 'Tablet', ready: false, icon: 'M5 3h14v18H5zM11 18h2' },
  { id: 'phone', name: 'Phone', ready: false, icon: 'M8 2h8v20H8zM11 18h2' }
];

const M = 'Main inspection';

export const COMPUTER_CHECKS = [
  { id: 'm1', section: M, title: 'Mobicode check', how: 'Check the serial number on Mobicode. It must come back clear (not lost or stolen).', tool: 'mobicode' },
  { id: 'm4', section: M, title: 'Licence key intact', how: 'Windows licence key present.' },
  { id: 'm5', section: M, title: 'Spec matches quote', how: 'Specs read from the machine compared with the listing.' },
  { id: 'm6', section: M, title: 'BIOS passwords', how: 'Restart into the BIOS / firmware setup. No admin or system password set.' },
  { id: 'm7', section: M, title: 'Windows 11 PC Health Check', how: 'Machine meets Windows 11 requirements.' },
  { id: 'm8', section: M, title: 'Boot test', how: 'Boots cleanly to the desktop.' },
  { id: 'm9', section: M, title: 'Encryption / BitLocker removed', how: 'Drive must not be encrypted.' },
  { id: 'v6', section: M, title: '‘Find My’ removed', how: 'Mac only: Find My / Activation Lock must be off.' },
  { id: 'm10', section: M, title: 'Remote management', how: 'Not enrolled in any company management (Intune, Azure AD, domain, MDM).' },
  { id: 'm11', section: M, title: 'Functionality (stress test)', how: 'Pushes the processor, graphics and memory hard for a minute. Watches for freezes, crashes and overheating slow-downs.', tool: 'stress' },
  { id: 'm12', section: M, title: 'Trackpad + input', how: 'Move, tap, click both buttons and two-finger scroll in the box.', tool: 'trackpad' },
  { id: 'm13', section: M, title: 'Fingerprint scanner', how: 'Check the fingerprint reader recognises a finger.', tool: 'fingerprint' },
  { id: 'm14', section: M, title: 'Keyboard', how: 'Press every key. Each one lights red when it registers. Click a key to mark it by hand.', tool: 'keys' },
  { id: 'm15', section: M, title: 'Touchscreen', how: 'Drag your finger over every square until the whole grid is red.', tool: 'touch' },
  { id: 'm16', section: M, title: 'Screen', how: 'Show each colour full screen. Look for dead pixels, lines or bleed. Click to change colour, Esc to exit.', tool: 'screen' },
  { id: 'm17', section: M, title: 'WiFi + Bluetooth', how: 'Connects to WiFi and finds Bluetooth devices.' },
  { id: 'm18', section: M, title: 'Speakers', how: 'Play each side. Both channels work, no rattle.', tool: 'speaker' },
  { id: 'm19', section: M, title: 'Camera', how: 'Clear picture and the camera light comes on.', tool: 'camera' },
  { id: 'm20', section: M, title: 'Microphone', how: 'Talk normally. The meter moves and playback is clear.', tool: 'mic' },
  { id: 'm21', section: M, title: 'Ports', how: 'Plug a USB device into each port in turn, and a screen into HDMI / DisplayPort. Each one ticks off as it’s detected.', tool: 'ports' },
  { id: 'm22', section: M, title: 'Memory card slot', how: 'Insert a memory card. It passes by itself as soon as the card is read.', tool: 'card' },
  { id: 'm23', section: M, title: 'Eject mechanism', how: 'Eject the disc tray three times. Clean every time.' },
  { id: 'm24', section: M, title: 'Battery', how: 'Battery health and charging.' },
  { id: 'm25', section: M, title: 'Reads discs', how: 'Insert a DVD. It should load first time.' },
  { id: 'm26', section: M, title: 'Error check via software', how: 'Drive health check.' },
  { id: 'm28', section: M, title: 'Activate Windows', how: 'Windows is activated.' },
  { id: 'm29', section: M, title: 'If no OS, set default password', how: 'Only when there is no operating system.' },
  // These two happen on the very last screen, after the result
  { id: 'm27', section: M, title: 'Factory reset', how: 'Reset to make it ready for sale.', final: true },
  { id: 'm30', section: M, title: 'Verify data deleted', how: 'After the reset it boots to the first-time setup screen.', final: true }
];

export const CONSOLE_CHECKS = [
  { id: 'c4', section: M, title: 'Boot test', how: 'Powers on and reaches the home screen with no errors.' },
  { id: 'c5', section: M, title: 'Controller test', how: 'Plug the pad into this computer by USB. Leave the sticks still, then press every button.', tool: 'pad' },
  { id: 'c6', section: M, title: 'Reads discs', how: 'Load a game disc and a Blu-ray. Both should load first time.' },
  { id: 'c7', section: M, title: 'Eject mechanism', how: 'Eject a disc three times. Clean every time.' },
  { id: 'c8', section: M, title: 'HDMI output', how: 'Picture and sound with no flicker.' },
  { id: 'c9', section: M, title: 'WiFi + Bluetooth', how: 'Join the store WiFi and pair a pad wirelessly.' },
  { id: 'c10', section: M, title: 'Ports', how: 'Every USB port with a pad or USB stick.' },
  { id: 'c11', section: M, title: 'Fan noise', how: 'Run a game for a few minutes. No grinding, rattling or overheating.' },
  { id: 'c12', section: M, title: 'Account removed', how: 'No user accounts or online sign-ins left.' },
  { id: 'c13', section: M, title: 'Factory reset', how: 'Reset from settings. Boots to first-time setup.' }
];

export const CONTROLLER_CHECKS = [
  { id: 'p2', section: M, title: 'Buttons + sticks', how: 'Plug the pad into this computer by USB. Leave the sticks still, then press every button.', tool: 'pad' },
  { id: 'p3', section: M, title: 'Charging', how: 'Charges over the cable and the light shows.' },
  { id: 'p4', section: M, title: 'Wireless pairing', how: 'Pairs to a console or this computer over Bluetooth.' },
  { id: 'p5', section: M, title: 'Headphone jack', how: 'Plug in headphones on a console. Sound comes through.' }
];

// Monitor: each screen-test check opens the full-screen tests at its own pages
export const MONITOR_CHECKS = [
  { id: 'mo1', section: M, title: 'Power + inputs', how: 'Turns on, and every input (HDMI, DisplayPort, USB-C) shows a picture.' },
  { id: 'mo2', section: M, title: 'Dead or stuck pixels', how: 'Full black, white, red, green and blue. Look for any dot that’s lit, dark or the wrong colour.', tool: 'monitor', pages: ['black', 'white', 'red', 'green', 'blue'] },
  { id: 'mo3', section: M, title: 'Backlight + uniformity', how: 'Grey at 25%, 50% and 75%. Brightness even all over, no patches, clouding or tinted areas.', tool: 'monitor', pages: ['uniformity', 'black'] },
  { id: 'mo4', section: M, title: 'Colours + gradients', how: 'Circles round, lines clear, gradients smooth with no banding or jumps.', tool: 'monitor', pages: ['pattern', 'gradients', 'distances', 'gamma'] },
  { id: 'mo5', section: M, title: 'Sharpness + viewing angle', how: 'Text crisp with no shadowing. Circles keep their shape from the side.', tool: 'monitor', pages: ['sharpness', 'angle'] },
  { id: 'mo6', section: M, title: 'Motion + refresh rate', how: 'Moving blocks leave short streaks. Measured refresh rate matches the monitor.', tool: 'monitor', pages: ['response'] },
  { id: 'mo7', section: M, title: 'Buttons + menu', how: 'Every button works, the menu opens and brightness changes.' },
];

export const HEADPHONE_CHECKS = [
  { id: 'h1', section: M, title: 'Left + right', how: 'Pick the headphones as the sound output. Left only in the left ear, right only in the right.', tool: 'speaker' },
  { id: 'h2', section: M, title: 'No crackle', how: 'Play the sweep and wiggle the cable at both ends. No crackle, buzz or cut-outs.', tool: 'speaker' },
  { id: 'h3', section: M, title: 'Microphone', how: 'Pick the headset mic and talk: the meter moves and playback is clear. No mic on this pair? Just press PASS.', tool: 'mic' }
];

export const MIC_CHECKS = [
  { id: 'mi1', section: M, title: 'Microphone', how: 'Pick the mic and talk normally: the meter moves and playback is clear. Then stay quiet: the quiet level stays low (no hiss or hum).', tool: 'mic' }
];

export const KEYBOARD_CHECKS = [
  { id: 'k1', section: M, title: 'Keyboard', how: 'Press every key. Each one lights red when it registers. Click a key to mark it by hand.', tool: 'keysFull' }
];

export const MOUSE_CHECKS = [
  { id: 'k3', section: M, title: 'Mouse', how: 'Click every button, scroll both ways and move it around the box.', tool: 'mouse' }
];

// Drive: plug it into this computer (SATA, M.2 slot or a USB adapter)
export const DRIVE_CHECKS = [
  { id: 'd1', section: M, title: 'Drive health', how: 'Pick the drive. Reads its own health report: bad sectors, wear, hours and temperature.', tool: 'drive', step: 'health' },
  { id: 'd2', section: M, title: 'Bad sector scan', how: 'Reads the drive to find unreadable or slow areas. Read-only: nothing on the drive is changed.', tool: 'drive', step: 'scan' },
  { id: 'd3', section: M, title: 'Speed test', how: 'Read and write speed compared with what this drive should do.', tool: 'drive', step: 'speed' }
];

const LISTS = {
  console: CONSOLE_CHECKS, controller: CONTROLLER_CHECKS, monitor: MONITOR_CHECKS, headphones: HEADPHONE_CHECKS,
  microphone: MIC_CHECKS, keyboard: KEYBOARD_CHECKS, mouse: MOUSE_CHECKS, drive: DRIVE_CHECKS, computer: COMPUTER_CHECKS
};

export function checksFor(deviceType) {
  const dev = DEVICE_TYPES.find((d) => d.id === deviceType);
  if (!dev || !dev.list) return [];
  return LISTS[dev.list] || [];
}
