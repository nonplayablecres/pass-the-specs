// Pass the Specs: the desktop "shell".
// It opens a window, runs the system scan, and keeps the app up to date.
// The screens themselves live in /src (React) and are built into /dist.

const { app, BrowserWindow, ipcMain, session, clipboard, shell, Menu, dialog } = require('electron');
const os = require('os');

// ---- Crash safety net -------------------------------------------------------
// If anything goes wrong while starting, write it to a log and show a message
// instead of silently doing nothing.
const LOG = require('path').join(os.tmpdir(), 'pass-the-specs-log.txt');
function log(...parts) {
  try { require('fs').appendFileSync(LOG, `[${new Date().toISOString()}] ${parts.join(' ')}\n`); } catch { /* ignore */ }
}
function fatal(err) {
  const msg = (err && err.stack) || String(err);
  log('FATAL', msg);
  try { dialog.showErrorBox('Pass the Specs could not start', `${msg}\n\nA copy of this is saved in:\n${LOG}`); } catch { /* ignore */ }
}
process.on('uncaughtException', fatal);
process.on('unhandledRejection', fatal);
log('Starting', process.platform, process.arch, 'exe:', process.execPath);
const path = require('path');
const fs = require('fs');
const pkg = require('../package.json');
const { getSystemInfo, getPorts, run } = require('./systemInfo');
const { checkForUpdate, readVersion, isNewer } = require('./updater');
const { searchCex } = require('./cex');

const isDev = !!process.env.PTS_DEV;
const SHELL_VERSION = pkg.version;
let win = null;

// Folder the app was started from (e.g. the USB stick), so updates are saved next to it.
function appFolder() {
  if (process.env.PORTABLE_EXECUTABLE_DIR) return process.env.PORTABLE_EXECUTABLE_DIR;
  if (!app.isPackaged) return path.join(__dirname, '..', '.pts-dev');
  if (process.platform === 'darwin') return path.resolve(path.dirname(process.execPath), '..', '..', '..');
  return path.dirname(process.execPath);
}

// Where downloaded updates are stored. Falls back to the user profile if the folder is read-only.
function dataFolder() {
  const preferred = appFolder();
  try {
    fs.mkdirSync(preferred, { recursive: true });
    fs.accessSync(preferred, fs.constants.W_OK);
    return preferred;
  } catch {
    return app.getPath('userData');
  }
}

const BUNDLED_UI = path.join(__dirname, '..', 'dist');
function updatedUi() { return path.join(dataFolder(), 'pts-ui'); }

// Use whichever copy of the screens is newer: the one inside the exe, or a downloaded update.
function currentUi() {
  const bundled = readVersion(BUNDLED_UI);
  const downloaded = readVersion(updatedUi());
  if (downloaded && (!bundled || isNewer(downloaded.version, bundled.version)) &&
      !isNewer(downloaded.minShell || '0.0.0', SHELL_VERSION)) {
    return { dir: updatedUi(), version: downloaded.version };
  }
  return { dir: BUNDLED_UI, version: bundled ? bundled.version : SHELL_VERSION };
}

function checksFolder() {
  if (isDev) return path.join(__dirname, '..', 'public', 'checks');
  return path.join(currentUi().dir, 'checks');
}

function loadUi() {
  if (isDev) return win.loadURL('http://localhost:5173');
  return win.loadFile(path.join(currentUi().dir, 'index.html'));
}

function createWindow() {
  Menu.setApplicationMenu(null);
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 680,
    backgroundColor: '#111113',
    title: 'Pass the Specs',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false // keep the stress test running at full speed
    }
  });

  // Allow camera, microphone and full screen (needed for the hardware tests).
  // window-management: lets the monitor test go full screen on a chosen screen
  const allowed = ['media', 'fullscreen', 'clipboard-sanitized-write', 'window-management', 'window-placement'];
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(allowed.includes(permission)));
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => allowed.includes(permission));

  // Open any web links in the normal browser, not inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('did-fail-load', (_e, code, desc, url) => log('Page failed to load', code, desc, url));
  win.webContents.on('render-process-gone', (_e, d) => log('Screen process stopped', JSON.stringify(d)));
  loadUi();
  win.webContents.once('did-finish-load', () => { if (!isDev) runUpdateCheck(); });
}

async function runUpdateCheck() {
  try {
    const result = await checkForUpdate({
      repo: pkg.pts && pkg.pts.githubRepo,
      currentVersion: currentUi().version,
      shellVersion: SHELL_VERSION,
      dataDir: dataFolder()
    });
    if (result && win) win.webContents.send('pts:update', result);
  } catch (err) {
    console.log('Update check skipped:', err.message);
  }
}

ipcMain.handle('pts:system-info', async () => getSystemInfo(checksFolder()));
ipcMain.handle('pts:app-info', async () => ({
  uiVersion: currentUi().version,
  shellVersion: SHELL_VERSION,
  platform: process.platform
}));
ipcMain.handle('pts:copy', async (_e, text) => { clipboard.writeText(String(text)); return true; });
ipcMain.handle('pts:reload', async () => { loadUi(); return true; });
ipcMain.handle('pts:open', async (_e, url) => {
  if (typeof url === 'string' && url.startsWith('https://')) await shell.openExternal(url);
  return true;
});

ipcMain.handle('pts:cex-search', async (_e, query) => {
  try {
    return { ok: true, hits: await searchCex(String(query || '').slice(0, 200), SHELL_VERSION) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// Drive tester (see drives.js). Progress is sent back while a scan / speed test runs.
const drives = require('./drives');
ipcMain.handle('pts:drives', async () => drives.listDrives(checksFolder()));
ipcMain.handle('pts:drive-scan', async (e, opts) => {
  try { return await drives.scan(checksFolder(), opts || {}, (p) => { if (!e.sender.isDestroyed()) e.sender.send('pts:drive-progress', p); }); } catch (err) { return { ok: false, error: err.message }; }
});
ipcMain.handle('pts:drive-speed', async (e, opts) => {
  try { return await drives.speed(checksFolder(), opts || {}, (p) => { if (!e.sender.isDestroyed()) e.sender.send('pts:drive-progress', p); }); } catch (err) { return { ok: false, error: err.message }; }
});
ipcMain.handle('pts:drive-stop', async () => drives.stop());

ipcMain.handle('pts:ports', async () => {
  const res = await getPorts(checksFolder());
  // 'screen' can only be loaded once the app has started, so it's required here
  const { screen } = require('electron');
  return { ...res, displays: screen.getAllDisplays().length };
});

// Saves the test report as a text file in a "reports" folder next to the app (on the USB stick)
ipcMain.handle('pts:save-report', async (_e, { name, text }) => {
  try {
    const dir = path.join(dataFolder(), 'reports');
    fs.mkdirSync(dir, { recursive: true });
    const safe = String(name || 'report').replace(/[^a-z0-9_.-]+/gi, '_').slice(0, 80);
    const file = path.join(dir, safe + '.txt');
    fs.writeFileSync(file, String(text), 'utf8');
    return { ok: true, file };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// Camera / microphone access status (the page itself makes the one request)
ipcMain.handle('pts:media-access', async (_e, kind) => {
  const { systemPreferences } = require('electron');
  if (!['camera', 'microphone'].includes(kind)) return { status: 'unknown' };
  try {
    if (process.platform === 'darwin') {
      // Status only. Asking here as well as in the page made macOS prompt twice.
      return { status: systemPreferences.getMediaAccessStatus(kind) };
    }
    if (process.platform === 'win32') return { status: systemPreferences.getMediaAccessStatus(kind) };
  } catch { /* fall through */ }
  return { status: 'unknown' };
});

// Touch ID test on a Mac: asks for a fingerprint, returns whether it worked
ipcMain.handle('pts:touch-id', async (_e, action) => {
  if (process.platform !== 'darwin') return { ok: false, supported: false };
  const { systemPreferences } = require('electron');
  const can = systemPreferences.canPromptTouchID();
  if (action !== 'prompt') return { ok: true, supported: true, ready: can };
  if (!can) return { ok: false, supported: true, ready: false, error: 'No fingerprints set up' };
  try {
    await systemPreferences.promptTouchID('test the fingerprint reader');
    return { ok: true, supported: true, ready: true, passed: true };
  } catch (err) {
    return { ok: false, supported: true, ready: true, passed: false, error: err.message };
  }
});

// Saves Windows' own battery report (an HTML page) into the reports folder on the stick
ipcMain.handle('pts:battery-report', async (_e, name) => {
  if (process.platform !== 'win32') return { ok: false, error: 'Windows only' };
  try {
    const dir = path.join(dataFolder(), 'reports');
    fs.mkdirSync(dir, { recursive: true });
    const safe = String(name || 'device').replace(/[^a-z0-9_.-]+/gi, '_').slice(0, 80);
    const file = path.join(dir, safe + '_battery.html');
    await run('powercfg.exe', ['/batteryreport', '/output', file], 30000);
    return fs.existsSync(file) ? { ok: true, file } : { ok: false, error: 'Report not created' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// Opens the built-in "reset this computer" screen. The user still confirms inside Windows / macOS.
ipcMain.handle('pts:factory-reset', async () => {
  try {
    if (process.platform === 'win32') {
      const exe = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'systemreset.exe');
      await run('cmd.exe', ['/c', 'start', '', exe, '-factoryreset'], 10000);
      return { ok: true };
    }
    if (process.platform === 'darwin') {
      await run('open', ['-a', 'Erase Assistant'], 10000);
      return { ok: true };
    }
    return { ok: false, error: 'Not supported on this system' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

app.whenReady().then(() => {
  log('Ready, opening window');
  try { createWindow(); } catch (err) { fatal(err); }
}).catch(fatal);
app.on('window-all-closed', () => app.quit());
