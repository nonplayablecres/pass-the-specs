# Pass the Specs

Fast, guided device testing. Plug in the USB stick, open the app, and click
through Pass / Fail / N/A. Anything the computer can check by itself
(BitLocker, remote management, Windows 11, activation, battery, drive health,
WiFi, spec vs listing) is done automatically.

---

## 1. One-time setup (about 10 minutes)

Install these three free programs on **your own PC**:

1. **Node.js** (the "LTS" version): https://nodejs.org
2. **Git**: https://git-scm.com/downloads (click Next through the installer)
3. **VS Code**: https://code.visualstudio.com

Then unzip `pass-the-specs.zip` somewhere simple, like `Documents\pass-the-specs`.
Avoid OneDrive folders if you can; they can slow things down.

## 2. Open it in VS Code

1. Open VS Code → **File → Open Folder…** → pick the `pass-the-specs` folder.
2. If it asks "Do you trust the authors?", click **Yes**.
3. Open the terminal: **View → Terminal** (or press <kbd>Ctrl</kbd> + <kbd>`</kbd>).
4. Type this and press Enter. It downloads everything the app needs (takes a few minutes the first time):

   ```
   npm install
   ```

> If it says `npm is not recognized`, close VS Code completely and open it again (Node.js needs a restart to be found).

## 3. Run it

```
npm run dev
```

The app opens in its own window. Leave the terminal running: whenever you save
a file, the window updates by itself. Close the window (or press
<kbd>Ctrl</kbd> + <kbd>C</kbd> in the terminal) to stop.

Want to look at it in a normal web browser instead? Run `npm run dev:web` and
open http://localhost:5173. It uses example data because a browser can't scan
the machine.

## 4. Where to change things

| What | File |
|---|---|
| The checks, their wording and order | `src/data/checklists.js` |
| What gets checked automatically, battery pass mark | `src/lib/autoChecks.js` (see `SETTINGS` at the top) |
| Colours and fonts | `src/styles.css` (the `:root` block at the top) |
| Example photos | Put them in `public/examples/`, named after the check id, e.g. `v1.jpg` |
| The Windows scan | `public/checks/windows.ps1` |
| The screens | `src/screens/` |
| The built-in tests (keyboard, camera…) | `src/tools/` |

## 5. Build the exe for the USB stick

```
npm run dist
```

When it finishes, your app is at **`release\PassTheSpecs.exe`**. Copy that one
file onto the USB stick. That's it.

- First time you run it on a PC, Windows may show **"Windows protected your PC"**.
  Click **More info → Run anyway**. (This is because the exe isn't code-signed.
  A signing certificate fixes it later if you sell the app.)
- Windows may ask for admin permission. Saying **Yes** gives fuller results
  (BitLocker, TPM and drive wear need it). Saying No still works, with a few
  checks left for you to do by hand.
- The single exe takes a few seconds to start because it unpacks itself each
  time. For instant start-up, run `npm run dist:folder` instead and copy the
  whole `release\win-unpacked` folder to the stick, then run
  `Pass the Specs.exe` inside it.

## 6. Put it on GitHub

GitHub stores your code safely online and is where updates come from.

1. Make a free account at https://github.com.
2. Click **+ → New repository**. Name it `pass-the-specs`, choose **Public**, and
   **don't** tick "Add a README". Click **Create repository**.
   - Public is needed for auto-update to download without a password. There's
     nothing secret in the code. If you go private later, updates will need a
     different host.
3. In VS Code open `package.json` and change this line to your username:

   ```json
   "githubRepo": "YOUR-GITHUB-USERNAME/pass-the-specs",
   ```

4. In the VS Code terminal, run these one at a time (swap in your username):

   ```
   git init
   git add .
   git commit -m "First version"
   git branch -M main
   git remote add origin https://github.com/YOUR-GITHUB-USERNAME/pass-the-specs.git
   git push -u origin main
   ```

   The first push opens a browser window to sign in to GitHub.

## 7. Release an update (and how auto-update works)

Every time you want to send out a new version:

```
npm version patch
git push --follow-tags
```

`npm version patch` bumps the version (0.1.0 → 0.1.1) and labels it. The
push sends it to GitHub, which then **builds the app for you**. Watch it in
your repo's **Actions** tab (takes about 5 minutes). When it's green, a new
entry appears under **Releases** with two files:

- `PassTheSpecs.exe`: the app itself. Download this **once** for your USB stick.
- `pts-ui.zip`: the update the app downloads by itself.

**What happens at work:** the next time the app is opened with internet, it
checks your Releases, quietly downloads the new version into a `pts-ui`
folder next to the exe on the stick, and shows **"Update downloaded · LOAD IT
NOW"**. No re-downloading the exe.

**Important for whoever edits the code:** the screens, checks and the Windows scan all
auto-update. If you ever change files in the `electron` folder (the bit that
opens the window and runs the scan), the old exe can't use that. In that case,
also set `"minShell"` in `package.json` to the new version number before
releasing. Older copies will then show **"needs the new exe · GET IT"**,
which opens the download page.

## 8. Mac

The Mac version has to be built on a Mac: copy the project over, run
`npm install`, then `npm run dist:mac`. The app is in `release/` as a zip.
Because it isn't signed, the first time you open it **right-click → Open**.
The Mac scan covers FileVault, MDM, Activation Lock / Find My, battery, drive,
RAM and CPU.

## 9. Good to know

- The scan **only reads** information. It never changes anything on the
  machine being tested.
- Nothing about the tested machine is sent anywhere. The only internet use is
  the update check to your GitHub.
- Visual inspection isn't in the app: that's done at the till. It's purely
  for the testing.
- The app names the machine in CeX format from what's actually inside, e.g.
  `Dell Latitude 7420/i7-1185G7/32GB Ram/256GB SSD/14"/W11` or, for a
  self-built PC, `Custom/i5-8500/16GB Ram/1TB SSD/RTX 2060 Super 8GB/W11`
  (the grade is left off because that comes from the till).
- Paste the listing title it's being bought against and the app compares
  CPU, RAM, storage and graphics card. If they don't match, it shows an amber
  **Different listing** note with the correct spec. That's not a fail, it
  just means pick the right listing.
- In the browser preview (`npm run dev:web`), add `?custom` to the address to
  see example data for a custom PC.
- After a factory reset, press **↻ Re-scan** in the header to refresh the
  automatic results (e.g. once BitLocker has been turned off).
- Only **Pass** and **Fail** buttons. Anything that doesn't apply (no
  touchscreen, no disc drive, no card reader, desktop battery…) is detected
  and skipped automatically.
- Done automatically: boot test, licence key, BIOS passwords (Dell, HP and
  Lenovo report this directly; other brands may still ask you), BitLocker,
  remote management, Windows 11, activation, WiFi, battery, drive health.
- **Stress test** (Functionality): one minute on every processor core, the
  graphics chip and 256MB of memory. It fails on freezes, crashes, memory
  errors or a big overheating slow-down. Change the length in
  `src/lib/autoChecks.js` (`stressSeconds`).
- **Ports** tick off live as you plug a USB device into each one, and an
  external screen into HDMI. **Memory card** passes by itself the moment a
  card is read.
- **CeX listing + barcode**: once a test starts, the app searches the CeX UK
  website for the exact spec it detected. On the result screen:
  - **On CeX**: tap the grade from the till and the barcode and prices appear.
  - **Price request**: no listing for that spec. If the same machine is listed
    with different RAM / storage / graphics, it shows those too.
  - It uses the same public search the CeX website uses, one search per test.
    When work gives you access to the internal stock system, swap the
    function in `electron/cex.js` for that. In the browser preview add
    `?near` or `?none` to the address to see the price-request screens.
- **Mobicode**: shows the serial with a Copy button. When you have the
  Mobicode web address, put it in `SETTINGS.mobicodeUrl` in
  `src/lib/autoChecks.js` (with `{serial}` where the serial goes) and the
  "Check on Mobicode" button will open it.
- Every test report is saved as a text file in a **reports** folder on the
  USB stick, so you can open it on the till PC.
- **Factory reset** is the very last screen, after the result. It opens
  Windows' own "Reset this PC" (or Erase Assistant on a Mac).
- **Before using it at work, check with your manager / IT** that running it
  from a USB stick is OK.

## Mac signing (plug-and-play on any Mac)

Without this, a downloaded Mac app needs the "Open Anyway" step once. With it,
it opens with a double-click everywhere. The build signs automatically as soon
as these five secrets exist.

1. Join the Apple Developer Program (developer.apple.com/programs, individual is fine).
2. On your Mac: Keychain Access → Certificate Assistant → Request a Certificate
   From a Certificate Authority → your email → Saved to disk.
3. developer.apple.com → Certificates → + → **Developer ID Application** →
   upload that request → download the certificate → double-click it.
4. Keychain Access → My Certificates → right-click "Developer ID Application: …"
   → Export → save as `cert.p12` with a password.
5. Terminal: `base64 -i cert.p12 | pbcopy` (copies it).
6. appleid.apple.com → Sign-In and Security → App-Specific Passwords → make one.
7. Your Team ID: developer.apple.com → Account → Membership details.
8. GitHub repo → Settings → Secrets and variables → Actions → New repository
   secret, five times:
   - `MAC_CERT_P12_BASE64`: paste from step 5
   - `MAC_CERT_PASSWORD`: the password from step 4
   - `APPLE_ID`: your Apple ID email
   - `APPLE_APP_SPECIFIC_PASSWORD`: from step 6
   - `APPLE_TEAM_ID`: from step 7
9. Release as normal. The Mac build log says "Signing and notarising with Apple".

## Getting changes from Claude

**Best: through GitHub.** Once the project is on GitHub (step 6), tell Claude
the repo name (e.g. `yourname/pass-the-specs`). Claude can then save changes
straight into your repo. To get them on your PC, click **Source Control**
(the branch icon on the left of VS Code) → **⋯ → Pull**, or run `git pull`.
Only the changed files update, and your own edits are kept.

**Until then: small update zips.** Claude sends a zip with just the changed
files. Right-click it → **Extract All…** → choose your `pass-the-specs`
folder → if Windows asks, pick **Replace the files in the destination**.
If `package.json` was in the update, run `npm install` again.

## Troubleshooting

| Problem | Fix |
|---|---|
| `npm is not recognized` | Restart VS Code (or the PC) after installing Node.js |
| `npm install` errors | Make sure you're in the `pass-the-specs` folder (the terminal path should end with it) |
| "Couldn't scan this machine" | Try running the exe again and say Yes to admin. Everything still works manually. |
| Camera or mic says blocked | Windows Settings → Privacy → Camera / Microphone → allow desktop apps |
| Updates never arrive | Check `githubRepo` in `package.json` matches your repo, and the release has `pts-ui.zip` attached |
| Build fails in the Actions tab | Click into the failed run to see the red step; usually a typo in a file you changed |

## Project map

```
pass-the-specs/
├─ electron/          Desktop shell: window, system scan, auto-update
├─ public/checks/     Windows scan script (auto-updates)
├─ public/examples/   Your example photos
├─ src/
│  ├─ data/           The checklists
│  ├─ lib/            Auto-check rules, listing reader
│  ├─ screens/        Start, Runner, Result
│  └─ tools/          Keyboard, screen, speakers, mic, camera, touch, trackpad, controller
├─ scripts/           Packs the update zip
└─ .github/workflows/ Builds a release when you push a version tag
```
