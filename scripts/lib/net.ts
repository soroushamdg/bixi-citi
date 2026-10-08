import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";

export const UA = "bixi-citi-build/1.0 (+https://github.com/soroushamdg; unofficial portfolio project)";

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function cached(path: string, produce: () => Promise<Buffer>): Promise<Buffer> {
  if (existsSync(path)) {
    const buf = await readFile(path);
    return path.endsWith(".gz") ? gunzipSync(buf) : buf;
  }
  const data = await produce();
  await mkdir(dirname(path), { recursive: true });
  const tmp = path + ".part";
  await writeFile(tmp, path.endsWith(".gz") ? gzipSync(data) : data);
  await rename(tmp, path);
  return data;
}

export async function fetchRetry(
  url: string,
  init: RequestInit = {},
  { tries = 5, label = url, timeoutMs = 120_000 } = {},
): Promise<Buffer> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      const res = await fetch(url, {
        ...init,
        headers: { "User-Agent": UA, ...(init.headers ?? {}) },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${label}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      lastErr = err;
      const wait = Math.min(60_000, 2000 * 2 ** attempt) + Math.random() * 1000;
      console.warn(`  ↻ ${label}: ${(err as Error).message}; retry in ${(wait / 1000).toFixed(0)} s`);
      await sleep(wait);
    }
  }
  throw lastErr;
}
