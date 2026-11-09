'use strict';

// Keeping your PC in shape, from her chat (system.js): what weighs on it right now, room to make
// (temporary files, the recycle bin, your biggest downloads), what starts with Windows, its apps'
// updates (winget), the same file kept twice, and why the internet is down. What removes or
// changes something only runs after your click in her chat, and what's yours goes to the recycle
// bin, never straight out (temporary files are the only ones deleted).

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const dns = require('node:dns').promises;
const crypto = require('node:crypto');
const { execFile, spawn } = require('node:child_process');
const { app, shell } = require('electron');
const apps = require('./apps');

const OLD = 7 * 24 * 60 * 60 * 1000; // temporary files untouched this long go, as Windows' Disk Cleanup does it
const GB = 1024 ** 3;

// Windows' own processes: never shown as weighing on it, never offered to close
const SYSTEM = new Set(('idle system registry secure system memory compression smss csrss wininit winlogon services lsass lsaiso '
  + 'svchost fontdrvhost dwm sihost ctfmon explorer searchhost searchindexer searchapp startmenuexperiencehost '
  + 'shellexperiencehost textinputhost runtimebroker applicationframehost dllhost conhost wmiprvse spoolsv audiodg msmpeng '
  + 'nissrv mpdefendercoreservice securityhealthservice securityhealthsystray smartscreen taskhostw wudfhost lockapp '
  + 'widgets widgetservice useroobebroker dashost wlanext unsecapp sgrmbroker mousocoreworker tiworker trustedinstaller '
  + 'capri electron').split(' '));
// hers to think with: shown, not offered to close
const MINE = new Set(['ollama', 'ollama app', 'claude', 'codex']);

// --- What weighs on it ------------------------------------------------------------------------

// The apps weighing most on it right now (over one second): { apps: [{ name, label, cpu (% of the
// whole processor), memory (bytes), window }], cpu (% in all), used, total (memory) }.
async function heavy() {
  const out = await apps.powershell(
    '$n = [Environment]::ProcessorCount; $before = @{}; Get-Process | ForEach-Object { $before[$_.Id] = $_.CPU }; '
    + '$clock = [Diagnostics.Stopwatch]::StartNew(); Start-Sleep -Milliseconds 1000; $s = $clock.Elapsed.TotalSeconds; '
    + '$rows = Get-Process | Where-Object { $_.Id -ne 0 -and $_.Id -ne $PID } | Group-Object ProcessName | ForEach-Object { '
    + '$cpu = 0; $mem = 0; $win = $false; $label = ""; '
    + 'foreach ($p in $_.Group) { if ($before.ContainsKey($p.Id) -and $p.CPU -ne $null) { $cpu += $p.CPU - $before[$p.Id] }; '
    + '$mem += $p.WorkingSet64; if ($p.MainWindowHandle -ne 0) { $win = $true; if (-not $label) { $label = $p.Description } } }; '
    + '[pscustomobject]@{ name = $_.Name; label = [string]$label; cpu = [math]::Round(100 * $cpu / $n / $s, 1); memory = $mem; window = $win } }; '
    + '@($rows | Where-Object { $_.cpu -gt 0.5 -or $_.memory -gt 150MB }) | ConvertTo-Json -Compress',
    20000,
  );
  const rows = [].concat(out ? JSON.parse(out) : []);
  const cpu = Math.min(100, Math.round(rows.reduce((sum, r) => sum + r.cpu, 0)));
  const shown = rows.filter((r) => !SYSTEM.has(r.name.toLowerCase()));
  // busy processor: what's using it; else what holds the memory
  const busy = shown.filter((r) => r.cpu >= 5).sort((a, b) => b.cpu - a.cpu);
  const big = shown.filter((r) => !busy.includes(r)).sort((a, b) => b.memory - a.memory);
  const list = [...busy, ...big].slice(0, 3).map((r) => ({
    name: r.name, label: (r.label || r.name).replace(/-Win64-Shipping$/i, ''), cpu: Math.min(100, r.cpu), memory: r.memory,
    window: r.window && !MINE.has(r.name.toLowerCase()),
  }));
  return { apps: list, cpu, used: os.totalmem() - os.freemem(), total: os.totalmem() };
}

// --- Room to make ----------------------------------------------------------------------------

const tempDirs = () => [os.tmpdir(), path.join(process.env.SystemRoot || 'C:\\Windows', 'Temp')];

// Every file under `dir` that `keep(file, stat)` wants, without following links (a junction can
// lead anywhere); stops after `max` files or `ms`.
async function walk(dir, keep, { depth = 8, max = 200000, ms = 30000 } = {}) {
  const found = [];
  const until = Date.now() + ms;
  let seen = 0;
  async function into(d, level) {
    if (level > depth || seen > max || Date.now() > until) return;
    let entries;
    try {
      entries = await fsp.readdir(d, { withFileTypes: true });
    } catch {
      return; // not ours to read
    }
    for (const e of entries) {
      seen++;
      if (e.isSymbolicLink()) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) await into(p, level + 1);
      else if (e.isFile()) {
        const s = await fsp.stat(p).catch(() => null);
        if (s && keep(p, s)) found.push({ path: p, name: e.name, size: s.size, mtime: s.mtimeMs });
      }
    }
  }
  await into(dir, 0);
  return found;
}

const oldTemp = async () => (await Promise.all(tempDirs().map((d) => walk(d, (_p, s) => Date.now() - s.mtimeMs > OLD)))).flat();

// your recycle bins, one per drive, in your own folder of each ($Recycle.Bin\<your SID>)
let sid = null;
async function binDirs() {
  sid ??= (await apps.powershell('[Security.Principal.WindowsIdentity]::GetCurrent().User.Value').catch(() => '')).trim();
  if (!sid) return [];
  return 'CDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((l) => `${l}:\\$Recycle.Bin\\${sid}`).filter((d) => fs.existsSync(d));
}
const binSize = async () => (await Promise.all((await binDirs()).map((d) => walk(d, (p) => path.basename(p) !== 'desktop.ini'))))
  .flat().reduce((sum, f) => sum + f.size, 0);

// { temp, sources, bin, big: [{ path, name, size }] }: what can go, in bytes (and what the temporary
// files mostly come from: "Adobe", so you know what you're clearing), and your three biggest downloads
async function space() {
  const downloads = app.getPath('downloads');
  const [temp, bin, big] = await Promise.all([oldTemp(), binSize(), walk(downloads, (_p, s) => s.size >= 100 * 1024 ** 2, { depth: 2 })]);
  const by = new Map();
  for (const f of temp) {
    const top = path.relative(os.tmpdir(), f.path).split(path.sep)[0];
    if (top && !top.startsWith('..') && top !== path.basename(f.path)) by.set(top, (by.get(top) || 0) + f.size);
  }
  const sources = [...by].filter(([, size]) => size >= 512 * 1024 ** 2).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([name, size]) => ({ name, size }));
  return {
    temp: temp.reduce((sum, f) => sum + f.size, 0), sources, bin,
    big: big.sort((a, b) => b.size - a.size).slice(0, 3).map(({ path: p, name, size }) => ({ path: p, name, size })),
  };
}

// The old temporary files deleted (those in use stay) and the recycle bin emptied: { freed }
async function clean() {
  let freed = 0;
  for (const f of await oldTemp()) {
    if (await fsp.rm(f.path, { force: true }).then(() => true, () => false)) freed += f.size;
  }
  const bin = await binSize();
  if (bin) {
    await apps.powershell('Clear-RecycleBin -Force -ErrorAction SilentlyContinue', 60000).catch(() => {});
    freed += bin - (await binSize());
  }
  return { freed };
}

// one of your downloads to the recycle bin (only files she offered: in your Downloads)
async function trash(file) {
  const downloads = path.resolve(app.getPath('downloads'));
  const p = path.resolve(String(file));
  if (!p.startsWith(downloads + path.sep) || !fs.existsSync(p)) return { ok: false };
  const size = (await fsp.stat(p)).size;
  return shell.trashItem(p).then(() => ({ ok: true, size }), () => ({ ok: false }));
}

// --- What starts with Windows ------------------------------------------------------------------

const APPROVED = 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved';
// where things start from, and where Windows keeps whether each one is on (as its Task Manager does)
const STARTS = [
  { where: 'user', key: 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', approved: `HKCU:\\${APPROVED}\\Run` },
  { where: 'machine', key: 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', approved: `HKLM:\\${APPROVED}\\Run` },
  { where: 'machine', key: 'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Run', approved: `HKLM:\\${APPROVED}\\Run32` },
];
const NOT_LISTED = /^(securityhealth|windowsdefender|capri|bdagent|bitdefender|avast|avgui|avp|kaspersky|mcafee|norton|egui|eset|mbam|malwarebytes|sophos)/i;

const ps = (s) => `'${String(s).replace(/'/g, "''")}'`;

// [{ name, where ('user', 'machine', 'folder', 'allFolder'), on }]
async function startup() {
  const approved = '$v = (Get-ItemProperty -LiteralPath $a -ErrorAction SilentlyContinue).$n; '
    + '$on = -not ($v -is [byte[]] -and $v.Length -gt 0 -and ($v[0] % 2) -eq 1); ';
  const out = await apps.powershell(
    '$out = @(); '
    + STARTS.map((s) => `$k = Get-Item -LiteralPath ${ps(s.key)} -ErrorAction SilentlyContinue; $a = ${ps(s.approved)}; `
      + `if ($k) { foreach ($n in $k.GetValueNames()) { if (-not $n) { continue }; ${approved}`
      + `$out += [pscustomobject]@{ name = $n; where = '${s.where}'; on = $on } } }; `).join('')
    + [['folder', 'Startup', `HKCU:\\${APPROVED}\\StartupFolder`], ['allFolder', 'CommonStartup', `HKLM:\\${APPROVED}\\StartupFolder`]]
      .map(([where, special, a]) => `$a = ${ps(a)}; Get-ChildItem -LiteralPath ([Environment]::GetFolderPath('${special}')) -File -ErrorAction SilentlyContinue | `
        + `Where-Object { $_.Name -ne 'desktop.ini' } | ForEach-Object { $n = $_.Name; ${approved}`
        + `$out += [pscustomobject]@{ name = $n; where = '${where}'; on = $on } }; `).join('')
    + '$out | ConvertTo-Json -Compress',
  );
  return [].concat(out ? JSON.parse(out) : []).filter((s) => !NOT_LISTED.test(s.name));
}

// One of them on or off at the next start, as the Task Manager does it. What's set for every
// account on the PC needs the admin's rights: { admin: true }, and the Task Manager opened for it.
async function setStartup(name, on) {
  const item = (await startup()).find((s) => s.name === name);
  if (!item) return { ok: false };
  if (item.where === 'machine' || item.where === 'allFolder') {
    execFile('taskmgr.exe', ['/0', '/startup'], () => {});
    return { ok: false, admin: true };
  }
  const key = `HKCU:\\${APPROVED}\\${item.where === 'folder' ? 'StartupFolder' : 'Run'}`;
  const value = on ? '[byte[]](2,0,0,0,0,0,0,0,0,0,0,0)' : '[byte[]](@(3,0,0,0) + [BitConverter]::GetBytes([DateTime]::Now.ToFileTime()))';
  const done = await apps.powershell(
    `if (-not (Test-Path -LiteralPath ${ps(key)})) { [void](New-Item -Path ${ps(key)}) }; `
    + `Set-ItemProperty -LiteralPath ${ps(key)} -Name ${ps(name)} -Value (${value}) -Type Binary; "ok"`,
  ).catch(() => '');
  return { ok: done.trim() === 'ok' };
}

// --- Its apps' updates (winget) -----------------------------------------------------------------

const WINGET_ARGS = ['--accept-source-agreements', '--disable-interactivity'];

function winget(args, onLine, ms) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn('winget', args, { windowsHide: true });
    } catch {
      resolve(null);
      return;
    }
    let out = '';
    const timer = setTimeout(() => child.kill(), ms);
    child.stdout.on('data', (chunk) => {
      const text = chunk.toString('utf8');
      out += text;
      if (onLine) for (const line of text.split(/[\r\n]+/)) if (line.trim()) onLine(line.trim());
    });
    child.on('error', () => {
      clearTimeout(timer);
      resolve(null); // no winget on this PC
    });
    child.on('close', () => {
      clearTimeout(timer);
      resolve(out);
    });
  });
}

// What has an update: [{ name, id, version, available }], or null without winget. winget prints a
// table in your language: its columns are found from where its header's words start.
async function updates() {
  const out = await winget(['upgrade', ...WINGET_ARGS], null, 90000);
  if (out == null) return null;
  const lines = out.split(/\r?\n/).map((l) => l.replace(/^[\s\S]*\r/, '').replace(/\s+$/, '')); // its spinner, redrawn with \r
  const rule = lines.findIndex((l) => /^-{10,}$/.test(l));
  if (rule < 1) return [];
  const starts = [...lines[rule - 1].matchAll(/\S+/g)].map((m) => m.index);
  if (starts.length < 4) return [];
  const rows = [];
  for (const line of lines.slice(rule + 1)) {
    if (!line.trim() || line.length < starts[3]) break; // the table's end ("3 upgrades available")
    const cell = (i) => line.slice(starts[i], starts[i + 1]).trim();
    rows.push({ name: cell(0), id: cell(1), version: cell(2), available: cell(3) });
  }
  return rows;
}

// Every update installed (each installer as winget runs it: Windows may ask you to allow one).
// onStep({ at, of, id }) as it goes; then what's still left: { left: [names] }.
async function updateAll(onStep = () => {}) {
  await winget(['upgrade', '--all', '--silent', '--accept-package-agreements', ...WINGET_ARGS], (line) => {
    const step = /^\((\d+)\/(\d+)\)[^[]*(?:\[([^\]]+)\])?/.exec(line); // "(2/5) Trouvé Discord [Discord.Discord]"
    if (step) onStep({ at: Number(step[1]), of: Number(step[2]), id: step[3] || '' });
  }, 45 * 60 * 1000);
  const left = await updates();
  return { left: (left || []).map((u) => u.name) };
}

// --- The same file twice ---------------------------------------------------------------------

const MEDIA = /\.(jpe?g|png|gif|webp|heic|heif|bmp|tiff?|dng|cr2|nef|arw|raw|mp4|mov|avi|mkv|m4v|3gp|webm)$/i;

// your folders she looks in, by what you call them
function folderOf(where) {
  const home = os.homedir();
  const onedrive = process.env.OneDrive || path.join(home, 'OneDrive');
  const base = {
    pictures: [app.getPath('pictures'), path.join(onedrive, 'Pictures'), path.join(onedrive, 'Images')],
    videos: [app.getPath('videos')],
    downloads: [app.getPath('downloads')],
    documents: [app.getPath('documents')],
    desktop: [app.getPath('desktop')],
  }[where] || [];
  return [...new Set(base.map((d) => path.resolve(d)))].filter((d) => fs.existsSync(d));
}

const hashOf = (file, bytes) => new Promise((resolve) => {
  const hash = crypto.createHash('sha1');
  fs.createReadStream(file, bytes ? { end: bytes - 1 } : {})
    .on('data', (c) => hash.update(c)).on('end', () => resolve(hash.digest('hex'))).on('error', () => resolve(null));
});

// Files kept twice or more in `where` ('pictures' by default): same size, then the same start, then
// the same content. [{ size, files: [paths, the oldest first: the one to keep] }]
let lastLook = null; // { where, at, groups }: what she found, for her button a moment later
const FRESH = 10 * 60 * 1000;

async function duplicates(where = 'pictures', onStep = () => {}) {
  const media = where === 'pictures' || where === 'videos';
  const files = (await Promise.all(folderOf(where).map((d) => walk(d, (p, s) => s.size >= 10 * 1024 && (!media || MEDIA.test(p)), { ms: 60000 })))).flat();
  const bySize = groups(files, (f) => f.size);
  const groupsFound = [];
  let done = 0;
  for (const same of bySize) {
    for (const start of groups(await withKey(same, (f) => hashOf(f.path, 64 * 1024)), (f) => f.key)) {
      for (const whole of groups(await withKey(start, (f) => hashOf(f.path)), (f) => f.key)) {
        groupsFound.push({ size: whole[0].size, files: whole.sort((a, b) => a.mtime - b.mtime).map((f) => f.path) });
      }
    }
    onStep({ at: ++done, of: bySize.length });
  }
  lastLook = { where, at: Date.now(), groups: groupsFound };
  return groupsFound;
}

// the groups of 2 or more with the same key
function groups(list, key) {
  const map = new Map();
  for (const item of list) {
    const k = key(item);
    if (k == null) continue;
    map.set(k, [...(map.get(k) || []), item]);
  }
  return [...map.values()].filter((g) => g.length > 1);
}

const withKey = async (list, key) => Promise.all(list.map(async (f) => ({ ...f, key: await key(f) })));

// The copies she found to the recycle bin, the oldest of each kept (looked for again if that was a
// while ago; a group with a file changed since is left alone)
async function trashDuplicates(where) {
  const look = lastLook?.where === where && Date.now() - lastLook.at < FRESH ? lastLook.groups : await duplicates(where);
  let count = 0;
  let freed = 0;
  for (const group of look) {
    if (!group.files.every((f) => fs.statSync(f, { throwIfNoEntry: false })?.size === group.size)) continue;
    for (const copy of group.files.slice(1)) {
      if (await shell.trashItem(copy).then(() => true, () => false)) {
        count++;
        freed += group.size;
      }
    }
  }
  return { count, freed };
}

// --- Why the internet is down --------------------------------------------------------------------

const tcp = (host, port, ms = 2500) => new Promise((resolve) => {
  const socket = net.connect({ host, port });
  const end = (ok) => {
    socket.destroy();
    resolve(ok);
  };
  socket.setTimeout(ms, () => end(false));
  socket.on('connect', () => end(true)).on('error', () => end(false));
});

// your box answers a ping (Windows' ping says "TTL=" for a real answer, in every language)
const pings = (host) => new Promise((resolve) => {
  execFile('ping.exe', ['-n', '1', '-w', '1500', host], { windowsHide: true, timeout: 5000 }, (_err, out) => resolve(/TTL=/i.test(String(out))));
});

function localIp() {
  return Object.entries(os.networkInterfaces())
    .filter(([name]) => !/virtual|vethernet|vmware|loopback|vbox|wsl|hyper-v/i.test(name))
    .flatMap(([, list]) => list || [])
    .find((a) => a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.'))?.address || null;
}

// Step by step: a network at all, your box, the internet past it, names (DNS: emptied and tried
// again if that's it), a sign-in page in the way (a hotel's Wi-Fi). { problem: null | 'offline' |
// 'box' | 'isp' | 'dns' | 'portal', fixed }
async function internet() {
  if (!localIp()) return { problem: 'offline' };
  const gateway = (await apps.powershell('Get-NetRoute -DestinationPrefix "0.0.0.0/0" -ErrorAction SilentlyContinue | '
    + 'Sort-Object RouteMetric | Select-Object -First 1 -ExpandProperty NextHop').catch(() => '')).trim();
  const out = await tcp('1.1.1.1', 443) || await tcp('8.8.8.8', 443);
  if (!out) return { problem: gateway && !(await pings(gateway)) ? 'box' : 'isp' };
  const named = () => dns.lookup('www.msftconnecttest.com').then(() => true, () => false);
  if (!(await named())) {
    await new Promise((resolve) => execFile('ipconfig.exe', ['/flushdns'], { windowsHide: true }, () => resolve()));
    return { problem: 'dns', fixed: await named() };
  }
  // Windows' own test page: anything else than its line, and something's in the way
  const page = await fetch('http://www.msftconnecttest.com/connecttest.txt', { redirect: 'manual', signal: AbortSignal.timeout(5000) })
    .then((r) => r.text(), () => null);
  return { problem: page == null || page.trim() === 'Microsoft Connect Test' ? null : 'portal' };
}

module.exports = { heavy, space, clean, trash, startup, setStartup, updates, updateAll, duplicates, trashDuplicates, internet, GB };
