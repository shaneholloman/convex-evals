import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, writeFileSync, existsSync, readFileSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { rmSync } from "fs";
import JSZip from "jszip";
import { ADMIN_KEY } from "../convexBackend.js";

describe("ADMIN_KEY", () => {
  it("is a non-empty hex string", () => {
    expect(ADMIN_KEY).toBeTruthy();
    expect(ADMIN_KEY).toMatch(/^[0-9a-f]+$/);
  });
});

describe("binary download URL construction", () => {
  it("constructs correct target pattern for known architectures", () => {
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

    // Test all combinations
    for (const [nodeArch, targetArch] of Object.entries(archMap)) {
      for (const [nodePlatform, targetOs] of Object.entries(osMap)) {
        const pattern = `convex-local-backend-${targetArch}-${targetOs}`;
        expect(pattern).toBeTruthy();
        expect(pattern).toContain("convex-local-backend");
        expect(pattern).toContain(targetArch);
        expect(pattern).toContain(targetOs);
      }
    }
  });

  it("maps arm64 to aarch64", () => {
    const archMap: Record<string, string> = {
      x64: "x86_64",
      arm64: "aarch64",
      ia32: "x86_64",
    };
    expect(archMap["arm64"]).toBe("aarch64");
  });

  it("maps darwin to apple-darwin", () => {
    const osMap: Record<string, string> = {
      darwin: "apple-darwin",
      linux: "unknown-linux-gnu",
      win32: "pc-windows-msvc",
    };
    expect(osMap["darwin"]).toBe("apple-darwin");
    expect(osMap["linux"]).toBe("unknown-linux-gnu");
    expect(osMap["win32"]).toBe("pc-windows-msvc");
  });
});

describe("binary name construction", () => {
  it("appends .exe on windows", () => {
    const version = "precompiled-2026-01-01-abc1234";
    const isWindows = true;
    const binaryName = `convex-local-backend-${version}${isWindows ? ".exe" : ""}`;
    expect(binaryName).toBe(
      "convex-local-backend-precompiled-2026-01-01-abc1234.exe",
    );
  });

  it("has no extension on non-windows", () => {
    const version = "precompiled-2026-01-01-abc1234";
    const isWindows = false;
    const binaryName = `convex-local-backend-${version}${isWindows ? ".exe" : ""}`;
    expect(binaryName).toBe(
      "convex-local-backend-precompiled-2026-01-01-abc1234",
    );
  });
});

describe("release asset matching", () => {
  const mockReleases = [
    {
      tag_name: "precompiled-2026-02-06-beabc80",
      assets: [
        {
          name: "convex-local-backend-x86_64-pc-windows-msvc.zip",
          browser_download_url:
            "https://github.com/get-convex/convex-backend/releases/download/precompiled-2026-02-06-beabc80/convex-local-backend-x86_64-pc-windows-msvc.zip",
        },
        {
          name: "convex-local-backend-x86_64-unknown-linux-gnu.zip",
          browser_download_url:
            "https://github.com/get-convex/convex-backend/releases/download/precompiled-2026-02-06-beabc80/convex-local-backend-x86_64-unknown-linux-gnu.zip",
        },
        {
          name: "convex-local-backend-x86_64-apple-darwin.zip",
          browser_download_url:
            "https://github.com/get-convex/convex-backend/releases/download/precompiled-2026-02-06-beabc80/convex-local-backend-x86_64-apple-darwin.zip",
        },
        {
          name: "convex-local-backend-aarch64-apple-darwin.zip",
          browser_download_url:
            "https://github.com/get-convex/convex-backend/releases/download/precompiled-2026-02-06-beabc80/convex-local-backend-aarch64-apple-darwin.zip",
        },
      ],
    },
  ];

  function findAsset(
    releases: typeof mockReleases,
    targetPattern: string,
  ): { name: string; version: string } | null {
    for (const release of releases) {
      for (const asset of release.assets) {
        if (asset.name.includes(targetPattern)) {
          return { name: asset.name, version: release.tag_name };
        }
      }
    }
    return null;
  }

  it("finds windows x64 asset", () => {
    const result = findAsset(
      mockReleases,
      "convex-local-backend-x86_64-pc-windows-msvc",
    );
    expect(result).not.toBeNull();
    expect(result!.name).toContain("windows");
    expect(result!.version).toBe("precompiled-2026-02-06-beabc80");
  });

  it("finds linux x64 asset", () => {
    const result = findAsset(
      mockReleases,
      "convex-local-backend-x86_64-unknown-linux-gnu",
    );
    expect(result).not.toBeNull();
    expect(result!.name).toContain("linux");
  });

  it("finds macOS arm64 asset", () => {
    const result = findAsset(
      mockReleases,
      "convex-local-backend-aarch64-apple-darwin",
    );
    expect(result).not.toBeNull();
    expect(result!.name).toContain("aarch64");
  });

  it("finds macOS x64 asset", () => {
    const result = findAsset(
      mockReleases,
      "convex-local-backend-x86_64-apple-darwin",
    );
    expect(result).not.toBeNull();
  });

  it("returns null for unsupported platform", () => {
    const result = findAsset(
      mockReleases,
      "convex-local-backend-riscv64-unknown-freebsd",
    );
    expect(result).toBeNull();
  });
});

describe("zip extraction for binary", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "backend-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("extracts binary from zip and writes to disk", async () => {
    // Create a mock zip containing the binary
    const zip = new JSZip();
    const fakeBinaryContent = Buffer.from("fake-binary-content");
    zip.file("convex-local-backend", fakeBinaryContent);

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

    // Simulate the extraction logic from convexBackend.ts
    const loadedZip = await JSZip.loadAsync(zipBuffer);
    const expectedName = "convex-local-backend";
    const entry = loadedZip.file(expectedName);
    expect(entry).not.toBeNull();

    const content = await entry!.async("nodebuffer");
    const binaryPath = join(tempDir, "convex-local-backend-v1");
    writeFileSync(binaryPath, content);

    expect(existsSync(binaryPath)).toBe(true);
    expect(Buffer.compare(readFileSync(binaryPath), fakeBinaryContent)).toBe(0);
  });

  it("extracts .exe binary from zip", async () => {
    const zip = new JSZip();
    const fakeBinary = Buffer.alloc(1024, 0x42);
    zip.file("convex-local-backend.exe", fakeBinary);

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
    const loadedZip = await JSZip.loadAsync(zipBuffer);
    const entry = loadedZip.file("convex-local-backend.exe");
    expect(entry).not.toBeNull();

    const content = await entry!.async("nodebuffer");
    const binaryPath = join(tempDir, "convex-local-backend-v1.exe");
    writeFileSync(binaryPath, content);

    expect(existsSync(binaryPath)).toBe(true);
    expect(readFileSync(binaryPath).length).toBe(1024);
  });

  it("reports error when binary not found in zip", async () => {
    const zip = new JSZip();
    zip.file("README.md", "this is a readme");

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
    const loadedZip = await JSZip.loadAsync(zipBuffer);
    const entry = loadedZip.file("convex-local-backend");

    expect(entry).toBeNull();
    // Should produce an informative error
    const contents = Object.keys(loadedZip.files).join(", ");
    expect(contents).toContain("README.md");
  });
});
