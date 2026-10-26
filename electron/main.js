// Pass the Specs: the desktop "shell".
// It opens a window, runs the system scan, and keeps the app up to date.
// The screens themselves live in /src (React) and are built into /dist.

const { app, BrowserWindow, ipcMain, session, clipboard, shell, Menu, screen } = require('electron');
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
  const allowed = ['media', 'fullscreen', 'clipboard-sanitized-write'];
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(allowed.includes(permission)));
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => allowed.includes(permission));

  // Open any web links in the normal browser, not inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });

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

ipcMain.handle('pts:ports', async () => {
  const res = await getPorts(checksFolder());
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

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
