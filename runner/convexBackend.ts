/**
 * Manages local Convex backend instances for testing.
 * Downloads the binary from GitHub releases and runs it on dynamic ports.
 */
import { mkdirSync, existsSync, chmodSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir, platform, arch } from "os";
import JSZip from "jszip";
import getPort from "get-port";
import { logInfo } from "./logging.js";

const INSTANCE_NAME = "carnitas";
const INSTANCE_SECRET =
  "4361726e697461732c206c69746572616c6c79206d65616e696e6720226c6974";

export const ADMIN_KEY =
  "0135d8598650f8f5cb0f30c34ec2e2bb62793bc28717c8eb6fb577996d50be5f4281b59181095065c5d0f86a2c31ddbe9b597ec62b47ded69782cd";

export interface ConvexBackend {
  port: number;
  siteProxyPort: number;
  process: ReturnType<typeof Bun.spawn>;
}

/**
 * Start a local Convex backend in the given directory.
 * Returns an object with port info and the process handle.
 * Caller must call `.process.kill()` when done.
 */
export async function startConvexBackend(
  backendDir: string,
): Promise<ConvexBackend> {
  const storageDir = join(backendDir, "convex_local_storage");
  mkdirSync(storageDir, { recursive: true });
  const sqlitePath = join(backendDir, "convex_local_backend.sqlite3");
  logInfo(`[backend] Downloading/locating binary...`);
  const binary = await downloadConvexBinary();
  logInfo(`[backend] Binary ready: ${binary}`);

  const port = await getPort();
  const siteProxyPort = await getPort();

  logInfo(`[backend] Starting on port ${port}...`);
  const proc = Bun.spawn(
    [
      binary,
      "--port", String(port),
      "--site-proxy-port", String(siteProxyPort),
      "--instance-name", INSTANCE_NAME,
      "--instance-secret", INSTANCE_SECRET,
      "--local-storage", storageDir,
      sqlitePath,
    ],
    {
      cwd: backendDir,
      stdout: Bun.file(join(backendDir, "backend.stdout.log")),
      stderr: Bun.file(join(backendDir, "backend.stderr.log")),
    },
  );

  await healthCheck(port);
  logInfo(`[backend] Healthy on port ${port}`);

  // Make sure process is still running
  if (proc.exitCode !== null) {
    throw new Error("Convex backend process failed to start");
  }

  return { port, siteProxyPort, process: proc };
}

/** Stop a running backend. */
export function stopConvexBackend(backend: ConvexBackend): void {
  try {
    backend.process.kill();
  } catch {
    // Already stopped
  }
}

/**
 * Convenience wrapper: start a backend, run a callback, then stop it.
 */
export async function withConvexBackend<T>(
  backendDir: string,
  fn: (backend: ConvexBackend) => Promise<T>,
): Promise<T> {
  const backend = await startConvexBackend(backendDir);
  try {
    return await fn(backend);
  } finally {
    stopConvexBackend(backend);
  }
}

async function healthCheck(port: number): Promise<void> {
  const deadline = Date.now() + 10_000;
  let attempts = 0;
  while (true) {
    try {
      const resp = await fetch(`http://localhost:${port}/version`);
      if (resp.ok) return;
    } catch {
      // retry
    }
    const remaining = deadline - Date.now();
    if (remaining < 0) {
      throw new Error(`Convex backend health check timed out on port ${port}`);
    }
    await Bun.sleep(Math.min(100 * 2 ** attempts, remaining));
    attempts++;
  }
}

// ── Binary download ──────────────────────────────────────────────────

let cachedReleases: unknown[] | null = null;

async function fetchConvexReleases(): Promise<unknown[]> {
  if (cachedReleases) return cachedReleases;
  const resp = await fetch(
    "https://api.github.com/repos/get-convex/convex-backend/releases?per_page=50",
  );
  if (!resp.ok) throw new Error(`Failed to fetch releases: ${resp.status}`);
  cachedReleases = (await resp.json()) as unknown[];
  return cachedReleases;
}

async function downloadConvexBinary(): Promise<string> {
  const releases = await fetchConvexReleases();

  const archMap: Record<string, string> = {
    x64: "x86_64",
    arm64: "aarch64",
    ia32: "x86_64",
  };
  const osMap: Record<string, string> = {
    darwin: "apple-darwin",
    linux: "unknown-linux-gnu",
    win32: "pc-windows-msvc",
  };

  const cpuArch = archMap[arch()] ?? arch();
  const osTriple = osMap[platform()] ?? platform();
  const targetPattern = `convex-local-backend-${cpuArch}-${osTriple}`;

  let matchingAsset: { name: string; browser_download_url: string } | null = null;
  let version: string | null = null;

  for (const release of releases as Array<{
    tag_name: string;
    assets: Array<{ name: string; browser_download_url: string }>;
  }>) {
    for (const asset of release.assets ?? []) {
      if (asset.name.includes(targetPattern)) {
        matchingAsset = asset;
        version = release.tag_name;
        break;
      }
    }
    if (matchingAsset) break;
  }

  if (!matchingAsset || !version) {
    throw new Error(`Could not find matching asset for ${targetPattern}`);
  }

  const binaryDir = join(homedir(), ".convex-evals", "releases");
  mkdirSync(binaryDir, { recursive: true });

  const isWindows = platform() === "win32";
  const binaryName = `convex-local-backend-${version}${isWindows ? ".exe" : ""}`;
  const binaryPath = join(binaryDir, binaryName);

  if (existsSync(binaryPath)) return binaryPath;

  logInfo(`Latest release: ${version}`);
  logInfo(`Downloading: ${matchingAsset.browser_download_url}`);

  const resp = await fetch(matchingAsset.browser_download_url);
  if (!resp.ok) throw new Error(`Download failed: ${resp.status}`);

  const zipPath = join(binaryDir, matchingAsset.name);
  await Bun.write(zipPath, resp);
  logInfo(`Downloaded: ${matchingAsset.name}`);

  // Unzip (cross-platform, pure JS)
  const zipData = await Bun.file(zipPath).arrayBuffer();
  const zip = await JSZip.loadAsync(zipData);
  const expectedName = `convex-local-backend${isWindows ? ".exe" : ""}`;

  const entry = zip.file(expectedName);
  if (!entry) {
    throw new Error(`Expected '${expectedName}' in zip but not found. Contents: ${Object.keys(zip.files).join(", ")}`);
  }

  const content = await entry.async("nodebuffer");
  writeFileSync(binaryPath, content);

  // Make executable on Unix
  if (!isWindows) {
    chmodSync(binaryPath, 0o755);
  }

  // Clean up zip
  try {
    unlinkSync(zipPath);
  } catch {
    // ignore
  }

  logInfo(`Extracted binary to: ${binaryPath}`);
  return binaryPath;
}
