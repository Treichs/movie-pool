// Start the dev server, and guarantee it is the only one.
//
// Run: npm run dev        (extra flags pass through: npm run dev -- --turbopack)
//
// WHY THIS EXISTS: `next dev` does not fail when port 3000 is taken. It retries
// up to ten times and quietly starts on 3001, 3002, … — see the `allowRetry`
// branch in next/dist/server/lib/start-server.js. One line in the log is the
// only warning you get. What you are left with is a STALE server still
// answering on localhost:3000 and a fresh one somewhere you are not looking,
// which reads as "my edits do nothing".
//
// So: find this repo's dev servers across the whole retry range, kill them,
// wait for the ports to actually release, then start one.
//
// IT ONLY KILLS SERVERS STARTED FROM THIS FOLDER. A listening process is a
// candidate only if its command line contains this repo's path, so a database
// on 3001, a Docker container, or another project's dev server is reported and
// left alone. That check is the whole reason this is a script rather than a
// one-line `kill-port 3000 && next dev`.
//
// `npm run dev:keep` is the plain `next dev`, for the rare case where a second
// server running at the same time is the point.

import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { connect } from "node:net";
import path from "node:path";

// The range Next's own retry can reach: the requested port plus nine attempts.
const PORTS = Array.from({ length: 10 }, (_, i) => 3000 + i);
const ROOT = process.cwd();
const WINDOWS = process.platform === "win32";

// Windows reports the same path with either drive-letter case and either slash
// — `C:\Dev\...` from one API, `c:/dev/...` from another — so both sides are
// flattened before they are compared. Comparing them raw silently matches
// nothing, which would make this script a no-op that looks like it worked.
const flatten = (value) => String(value ?? "").replace(/\\/g, "/").toLowerCase();
const ROOT_KEY = flatten(ROOT);

// ── WHO IS LISTENING ──────────────────────────────────────────────────────────
// Both branches answer the same question: for each port in range, which process
// holds it, and what was its command line. The command line is the only thing
// that says which project a server belongs to; a port number says nothing.

function windowsListeners() {
  // ONE PowerShell call for all ten ports. Ten separate calls cost about three
  // seconds of startup, which is long enough that you would stop using this.
  const script = `
$ErrorActionPreference = 'SilentlyContinue'
$rows = Get-NetTCPConnection -State Listen -LocalPort @(${PORTS.join(",")}) |
  Select-Object -Property LocalPort, OwningProcess -Unique
$out = foreach ($row in $rows) {
  $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $($row.OwningProcess)"
  [pscustomobject]@{
    port = [int]$row.LocalPort
    pid  = [int]$row.OwningProcess
    cmd  = [string]$proc.CommandLine
  }
}
ConvertTo-Json @($out) -Compress
`;
  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", script],
    { encoding: "utf8" },
  );
  const text = (result.stdout || "").trim();
  if (!text || text === "null") return [];
  try {
    const parsed = JSON.parse(text);
    // PowerShell 5.1 has no `-AsArray`, so a single row serialises as a bare
    // object rather than a one-element array.
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

function posixListeners() {
  const rows = [];
  for (const port of PORTS) {
    const lsof = spawnSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], {
      encoding: "utf8",
    });
    for (const pid of (lsof.stdout || "").split(/\s+/).filter(Boolean)) {
      const ps = spawnSync("ps", ["-o", "args=", "-p", pid], { encoding: "utf8" });
      rows.push({ port, pid: Number(pid), cmd: (ps.stdout || "").trim() });
    }
  }
  return rows;
}

function kill(pid) {
  if (WINDOWS) {
    // /T takes the whole tree. Next runs its compiler and router in child
    // processes, and the socket is not always held by the parent — killing the
    // parent alone can leave the port occupied by an orphan.
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }
  // Negative pid targets the process group, which is the POSIX equivalent of
  // /T. It only works if the process leads its group, hence the fallback.
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      /* already gone */
    }
  }
}

// A killed process releases its socket some milliseconds AFTER it dies. Start
// `next dev` inside that window and it sees the port as busy and drifts to
// 3001 — the exact bug this script exists to prevent. So the port is probed
// until a connection is refused.
const inUse = (port) =>
  new Promise((resolve) => {
    const socket = connect({ host: "127.0.0.1", port });
    const settle = (busy) => {
      socket.destroy();
      resolve(busy);
    };
    socket.setTimeout(400);
    socket.once("connect", () => settle(true));
    socket.once("timeout", () => settle(false));
    socket.once("error", () => settle(false));
  });

async function waitForRelease(ports, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  const pending = new Set(ports);
  while (pending.size && Date.now() < deadline) {
    for (const port of [...pending]) if (!(await inUse(port))) pending.delete(port);
    if (pending.size) await new Promise((r) => setTimeout(r, 120));
  }
  return [...pending];
}

// ── RUN ───────────────────────────────────────────────────────────────────────

const listening = WINDOWS ? windowsListeners() : posixListeners();
const ours = listening.filter((row) => flatten(row.cmd).includes(ROOT_KEY));
const theirs = listening.filter((row) => !flatten(row.cmd).includes(ROOT_KEY));

for (const { port, pid } of ours) {
  kill(pid);
  console.log(`  killed  pid ${pid} on port ${port}`);
}

// Reported, never killed. If something else owns 3000 then Next is about to
// drift to 3001 and you want to know why before you go looking for your app at
// the wrong address.
for (const { port, pid } of theirs) {
  console.log(`  left    pid ${pid} on port ${port} — not this repo`);
}

if (ours.length) {
  const stuck = await waitForRelease(ours.map((row) => row.port));
  if (stuck.length) console.log(`  warning: port ${stuck.join(", ")} still held`);
}

const nextBin = path.join(ROOT, "node_modules", "next", "dist", "bin", "next");
if (!existsSync(nextBin)) {
  console.error(`Cannot find Next at ${nextBin} — run npm install first.`);
  process.exit(1);
}

// Spawned through node against the CLI's real entry point rather than the
// node_modules/.bin shim: on Windows that shim is a .cmd file, which needs a
// shell, which brings back argument-quoting problems for no gain.
const child = spawn(process.execPath, [nextBin, "dev", ...process.argv.slice(2)], {
  stdio: "inherit",
});
child.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 0)));
