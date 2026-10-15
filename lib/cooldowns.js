/**
 * Bounded cooldown / rate-limit trackers.
 *
 * The original used a plain `Set` plus one `setTimeout` per user in
 * events/coinSystem.js and an unpruned `Map` in events/levelSystem.js.
 * On a large server those grew without limit and every user allocated a timer.
 *
 * This implementation stores expiry timestamps (no timers at all) and evicts
 * stale entries once the map exceeds a cap, so memory stays bounded.
 */
class Cooldowns {
    /**
     * @param {number} ttlMs   cooldown length per key
     * @param {number} maxSize eviction threshold
     */
    constructor(ttlMs, maxSize = 5000) {
        this.ttlMs = ttlMs;
        this.maxSize = maxSize;
        this.entries = new Map();
    }

    /** True when `key` is still cooling down (does NOT start a cooldown). */
    has(key) {
        const expiry = this.entries.get(key);
        if (expiry === undefined) return false;
        if (Date.now() >= expiry) {
            this.entries.delete(key);
            return false;
        }
        return true;
    }

    /**
     * Start a cooldown for `key`.
     * @returns {boolean} true if the cooldown was started, false if already active
     */
    take(key) {
        if (this.has(key)) return false;
        this.entries.set(key, Date.now() + this.ttlMs);
        this.evict();
        return true;
    }

    /** Milliseconds remaining, or 0. */
    remaining(key) {
        const expiry = this.entries.get(key);
        if (expiry === undefined) return 0;
        return Math.max(0, expiry - Date.now());
    }

    clear(key) {
        this.entries.delete(key);
    }

    evict() {
        if (this.entries.size <= this.maxSize) return;
        const now = Date.now();
        for (const [key, expiry] of this.entries) {
            if (expiry <= now) this.entries.delete(key);
        }
        // Still over cap: drop the oldest-inserted entries.
        if (this.entries.size > this.maxSize) {
            const excess = this.entries.size - this.maxSize;
            let removed = 0;
            for (const key of this.entries.keys()) {
                if (removed >= excess) break;
                this.entries.delete(key);
                removed += 1;
            }
        }
    }

    get size() {
        return this.entries.size;
    }
}

/**
 * Sliding-window counter, used by the anti-spam listener.
 * Replaces the per-message array allocation in the original implementation.
 */
class SlidingWindow {
    constructor(windowMs, maxSize = 5000) {
        this.windowMs = windowMs;
        this.maxSize = maxSize;
        this.entries = new Map();
    }

    /** Push a hit and return the number of hits inside the window. */
    hit(key) {
        const now = Date.now();
        let stamps = this.entries.get(key);
        if (!stamps) {
            stamps = [];
            this.entries.set(key, stamps);
        }
        const cutoff = now - this.windowMs;
        while (stamps.length && stamps[0] < cutoff) stamps.shift();
        stamps.push(now);

        if (this.entries.size > this.maxSize) {
            for (const [k, v] of this.entries) {
                if (!v.length || v[v.length - 1] < cutoff) this.entries.delete(k);
            }
        }
        return stamps.length;
    }

    reset(key) {
        this.entries.delete(key);
    }
}

module.exports = { Cooldowns, SlidingWindow };
