import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';

/** Only synthetic seed sources are readable; no absolute paths, no traversal. */
const SOURCE_PATH = /^graph\/seed\/sources\/[A-Za-z0-9][A-Za-z0-9._-]*\.txt$/;

/**
 * Read-time verification against the immutable source files (the trust anchor outside the graph).
 * A source is trusted only when the file's SHA-256 equals the hash recorded in the graph; an excerpt
 * only when it equals the file text at its recorded Unicode code-point offsets. Graph writes alone
 * cannot forge either.
 */
export class SourceFiles {
  #cache = new Map<string, Promise<string[] | null>>();
  constructor(readonly root: string = process.cwd()) {}

  /** Verified file text as code points, or null (bad path, unreadable, or hash mismatch). */
  codePoints(path: string | null | undefined, sha256: string | null | undefined): Promise<string[] | null> {
    if (typeof path !== 'string' || typeof sha256 !== 'string' || !SOURCE_PATH.test(path)) return Promise.resolve(null);
    const key = `${path}\u0000${sha256}`;
    let p = this.#cache.get(key);
    if (!p) {
      const base = resolve(this.root);
      const full = resolve(join(base, path));
      p = !full.startsWith(base + sep) ? Promise.resolve(null) : readFile(full)
        .then(bytes => createHash('sha256').update(bytes).digest('hex') === sha256 ? Array.from(bytes.toString('utf8')) : null)
        .catch(() => null);
      this.#cache.set(key, p);
    }
    return p;
  }

  async text(path: string | null | undefined, sha256: string | null | undefined): Promise<string | null> {
    const cps = await this.codePoints(path, sha256);
    return cps ? cps.join('') : null;
  }

  /** True only when the excerpt is exactly the verified file text at [startOffset, endOffset). */
  async excerptHolds(ref: { path: string; sha256: string; excerpt: string; startOffset: number; endOffset: number }): Promise<boolean> {
    const cps = await this.codePoints(ref.path, ref.sha256);
    if (!cps) return false;
    const { startOffset: s, endOffset: e } = ref;
    if (!Number.isInteger(s) || !Number.isInteger(e) || s < 0 || e <= s || e > cps.length) return false;
    return cps.slice(s, e).join('') === ref.excerpt;
  }
}
