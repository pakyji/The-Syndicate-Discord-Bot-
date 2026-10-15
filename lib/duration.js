/**
 * Shared duration parsing.
 *
 * This existed TWICE in the first fix pass — as `parseDuration` exported from
 * commands/utility/giveaway.js (which nothing ever called) and as
 * `parseGiveawayDuration` inside events/interactionCreate.js. Two copies of the
 * same rule with the same hardcoded 30-day cap in two places is exactly how they
 * drift apart, so there is one implementation now.
 *
 * Why bounds matter: the original accepted any free-text string and multiplied it
 * straight into a `setTimeout`. A value above 2^31-1 ms overflows Node's int32
 * timer and fires IMMEDIATELY, so a "30 day" giveaway would end the instant it
 * was created; a negative or NaN value produced an Invalid Date in the embed.
 */

/** Discord giveaway/poll timers are int32 milliseconds — never exceed this. */
const MAX_SAFE_TIMEOUT_MS = 2 ** 31 - 1;

const UNITS = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000,
};

/**
 * Parse "10s", "5m", "2h", "3d", "1w" into milliseconds.
 *
 * @param {string} input
 * @param {{minMs?:number, maxMs?:number}} [opts]
 * @returns {number|null} milliseconds, or null when the input is unusable
 */
function parseDuration(input, opts = {}) {
    const minMs = Number.isFinite(opts.minMs) ? Math.max(0, opts.minMs) : 1000;
    const maxMs = Number.isFinite(opts.maxMs)
        ? Math.min(opts.maxMs, MAX_SAFE_TIMEOUT_MS)
        : MAX_SAFE_TIMEOUT_MS;

    const match = /^(\d+)\s*([smhdw])$/i.exec(String(input ?? '').trim());
    if (!match) return null;

    const value = Number(match[1]);
    if (!Number.isFinite(value) || value <= 0) return null;

    const ms = value * UNITS[match[2].toLowerCase()];
    if (!Number.isFinite(ms) || ms < minMs || ms > maxMs) return null;
    return ms;
}

/**
 * Giveaway bounds: 10 seconds minimum, 21 days maximum.
 *
 * ⭐ The ceiling used to be advertised as 30 days, but 30 * 86_400_000 =
 * 2_592_000_000 ms exceeds Node's int32 timer limit (2^31 - 1 = 2_147_483_647).
 * Both the giveaway and its join button are closed by a `setTimeout`/collector
 * built on that timer, and Node fires an out-of-range timeout IMMEDIATELY with a
 * TimeoutOverflowWarning — so a "30 day" giveaway ended the instant it was
 * created and picked a winner from zero entrants. 21 days is the largest round
 * value that a single timer can actually schedule.
 */
const GIVEAWAY_LIMITS = { minMs: 10_000, maxMs: 21 * 24 * 60 * 60 * 1000 };

/** Parse a giveaway duration with the giveaway bounds applied. */
function parseGiveawayDuration(input) {
    return parseDuration(input, GIVEAWAY_LIMITS);
}

/** Human-readable hint for a pair of bounds, floored to whole units. */
function describeDurationLimits({ minMs, maxMs }) {
    const fmt = (ms) => {
        if (ms >= 86_400_000) return `${Math.floor(ms / 86_400_000)}d`;
        if (ms >= 3_600_000) return `${Math.floor(ms / 3_600_000)}h`;
        if (ms >= 60_000) return `${Math.floor(ms / 60_000)}m`;
        return `${Math.floor(ms / 1000)}s`;
    };
    return `${fmt(minMs)} minimum, ${fmt(maxMs)} maximum`;
}

module.exports = {
    parseDuration,
    parseGiveawayDuration,
    describeDurationLimits,
    GIVEAWAY_LIMITS,
    MAX_SAFE_TIMEOUT_MS,
    UNITS,
};
