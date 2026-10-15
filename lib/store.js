/**
 * Atomic JSON file storage.
 *
 * Every write goes to `<file>.tmp` and is then renamed over the target.
 * rename(2) is atomic on the same filesystem, so a crash mid-write can never
 * leave a truncated/corrupt JSON file behind — the old version survives intact.
 *
 * Reads fall back to the supplied default (and self-heal a corrupt file by
 * quarantining it as `<file>.corrupt-<ts>.json`) instead of throwing, so a bad
 * disk write can never hard-crash a command handler.
 *
 * All mutations funnel through `mutate()`, which serialises concurrent
 * read-modify-write cycles per file. That removes the lost-update race where
 * two users running /coinflip at the same time clobbered each other's balance.
 */
const fs = require('fs');
const path = require('path');

/** Per-file mutexes so read-modify-write cycles cannot interleave. */
const writeLocks = new Map();

/** In-memory read cache. JSON stores here are small; caching avoids sync disk I/O per message. */
const readCache = new Map();

function resolvePath(filePath) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return filePath;
}

function quarantine(filePath, raw) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backup = `${filePath}.corrupt-${stamp}.json`;
    try {
        fs.writeFileSync(backup, raw);
    } catch {
        /* best effort */
    }
    return backup;
}

/**
 * Read + parse. Never throws.
 * @param {string} filePath
 * @param {*} fallback returned when the file is missing or unreadable
 */
function read(filePath, fallback = {}) {
    resolvePath(filePath);

    if (readCache.has(filePath)) return readCache.get(filePath);

    if (!fs.existsSync(filePath)) {
        readCache.set(filePath, fallback);
        return fallback;
    }

    let raw;
    try {
        raw = fs.readFileSync(filePath, 'utf8');
    } catch (error) {
        console.error(`[store] cannot read ${filePath}:`, error.message);
        readCache.set(filePath, fallback);
        return fallback;
    }

    if (!raw.trim()) {
        readCache.set(filePath, fallback);
        return fallback;
    }

    try {
        const parsed = JSON.parse(raw);
        readCache.set(filePath, parsed);
        return parsed;
    } catch (error) {
        const backup = quarantine(filePath, raw);
        console.error(`[store] ${filePath} is corrupt JSON (${error.message}). Quarantined to ${backup}; using defaults.`);
        readCache.set(filePath, fallback);
        return fallback;
    }
}

/** Atomic, error-safe write. */
function write(filePath, data) {
    resolvePath(filePath);
    const tmp = `${filePath}.tmp`;
    try {
        fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
        fs.renameSync(tmp, filePath);
        readCache.set(filePath, data);
        return true;
    } catch (error) {
        console.error(`[store] failed to write ${filePath}:`, error.message);
        try { fs.unlinkSync(tmp); } catch { /* ignore */ }
        return false;
    }
}

/**
 * Serialised read-modify-write. `fn` receives the current data and returns the
 * next state (return the same object mutated in place, or a new one).
 * Concurrent calls on the same file queue up instead of racing.
 * @returns {Promise<{ok: boolean, result: *, data: *}>}
 */
async function mutate(filePath, fallback, fn) {
    const previous = writeLocks.get(filePath) || Promise.resolve();

    let release;
    const current = new Promise((resolve) => { release = resolve; });
    writeLocks.set(filePath, previous.then(() => current));

    await previous;
    try {
        const data = read(filePath, fallback);
        const result = await fn(data);
        const next = result === undefined ? data : result;
        const ok = write(filePath, next);
        return { ok, result, data: next };
    } catch (error) {
        console.error(`[store] mutate failed for ${filePath}:`, error);
        return { ok: false, result: undefined, data: undefined };
    } finally {
        release();
        // Keep the lock map from growing forever.
        if (writeLocks.get(filePath) && writeLocks.get(filePath) === current) {
            writeLocks.delete(filePath);
        }
    }
}

/** Drop a cached entry (e.g. after an external edit). */
function invalidate(filePath) {
    readCache.delete(filePath);
}

module.exports = { read, write, mutate, invalidate };
