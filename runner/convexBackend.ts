/**
 * Manages local Convex backend instances for testing.
 * Downloads the binary from GitHub releases and runs it on dynamic ports.
 */
import {
  mkdirSync,
  existsSync,
  chmodSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import { homedir, platform, arch } from "os";
import JSZip from "jszip";
import getPort from "get-port";
import { logInfo } from "./logging.js";

/**
 * Thrown when infrastructure (binary download, GitHub API) fails fatally.
 * Caught at the run level to fail the whole run rather than individual evals.
 */
export class InfrastructureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InfrastructureError";
  }
}

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
 * Caller must call `stopConvexBackend()` when done.
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
      "--port",
      String(port),
      "--site-proxy-port",
      String(siteProxyPort),
      "--instance-name",
      INSTANCE_NAME,
      "--instance-secret",
      INSTANCE_SECRET,
      "--local-storage",
      storageDir,
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

/** Start a backend, run a callback, then stop it. */
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

// ── Health check ─────────────────────────────────────────────────────

const HEALTH_CHECK_TIMEOUT_MS = 10_000;

async function healthCheck(port: number): Promise<void> {
  const deadline = Date.now() + HEALTH_CHECK_TIMEOUT_MS;
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

const DOWNLOAD_TIMEOUT_MS = 120_000;

const ARCH_MAP: Record<string, string> = {
  x64: "x86_64",
  arm64: "aarch64",
  ia32: "x86_64",
};

const OS_MAP: Record<string, string> = {
  darwin: "apple-darwin",
  linux: "unknown-linux-gnu",
  win32: "pc-windows-msvc",
};

interface GitHubRelease {
  tag_name: string;
  assets: Array<{ name: string; browser_download_url: string }>;
}

let cachedReleases: GitHubRelease[] | null = null;

async function fetchConvexReleases(): Promise<GitHubRelease[]> {
  if (cachedReleases) return cachedReleases;

  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 5000;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const resp = await fetch(
      "https://api.github.com/repos/get-convex/convex-backend/releases?per_page=50",
    );
    if (resp.ok) {
      cachedReleases = (await resp.json()) as GitHubRelease[];
      return cachedReleases;
    }
    if (attempt < MAX_RETRIES) {
      logInfo(
        `[backend] Failed to fetch releases (${resp.status}), retrying in ${RETRY_DELAY_MS / 1000}s (attempt ${attempt}/${MAX_RETRIES})...`,
      );
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    } else {
      throw new InfrastructureError(
        `Failed to fetch releases after ${MAX_RETRIES} attempts: ${resp.status}`,
      );
    }
  }
  // unreachable
  throw new InfrastructureError("Failed to fetch releases");
}

// Serialize concurrent download requests so only one download happens at a time
let downloadPromise: Promise<string> | null = null;

async function downloadConvexBinary(): Promise<string> {
  if (downloadPromise) return downloadPromise;
  downloadPromise = downloadConvexBinaryImpl();
  try {
    return await downloadPromise;
  } finally {
    downloadPromise = null;
  }
}

async function downloadConvexBinaryImpl(): Promise<string> {
  const releases = await fetchConvexReleases();

  const cpuArch = ARCH_MAP[arch()] ?? arch();
  const osTriple = OS_MAP[platform()] ?? platform();
  const targetPattern = `convex-local-backend-${cpuArch}-${osTriple}`;

  const match = findMatchingAsset(releases, targetPattern);
  if (!match) {
    throw new Error(`Could not find matching asset for ${targetPattern}`);
  }

  const binaryDir = join(homedir(), ".convex-evals", "releases");
  mkdirSync(binaryDir, { recursive: true });

  const isWindows = platform() === "win32";
  const binaryName = `convex-local-backend-${match.version}${isWindows ? ".exe" : ""}`;
  const binaryPath = join(binaryDir, binaryName);

  if (existsSync(binaryPath)) return binaryPath;

  logInfo(`Latest release: ${match.version}`);
  logInfo(`Downloading: ${match.asset.browser_download_url}`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    const resp = await fetch(match.asset.browser_download_url, {
      signal: controller.signal,
    });
    if (!resp.ok) throw new Error(`Download failed: ${resp.status}`);

    const data = await resp.arrayBuffer();
    const zipPath = join(binaryDir, match.asset.name);
    writeFileSync(zipPath, Buffer.from(data));
    logInfo(
      `Downloaded: ${match.asset.name} (${(data.byteLength / 1024 / 1024).toFixed(1)} MB)`,
    );

    // Extract binary from zip
    const zip = await JSZip.loadAsync(data);
    const expectedName = `convex-local-backend${isWindows ? ".exe" : ""}`;
    const entry = zip.file(expectedName);
    if (!entry) {
      throw new Error(
        `Expected '${expectedName}' in zip but not found. Contents: ${Object.keys(zip.files).join(", ")}`,
      );
    }

    const content = await entry.async("nodebuffer");
    writeFileSync(binaryPath, content);

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
  } finally {
    clearTimeout(timeoutId);
  }
}

function findMatchingAsset(
  releases: GitHubRelease[],
  targetPattern: string,
): { asset: GitHubRelease["assets"][number]; version: string } | null {
  for (const release of releases) {
    for (const asset of release.assets ?? []) {
      if (asset.name.includes(targetPattern)) {
        return { asset, version: release.tag_name };
      }
    }
  }
  return null;
}
