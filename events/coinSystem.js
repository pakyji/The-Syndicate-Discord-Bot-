/**
 * Passive coin earning.
 *
 * Fixes vs. the original:
 *  • Coins now go to the SAME store the shop/mine/slots read from. Previously
 *    earning wrote `coins.json` while spending wrote
 *    `commands/economy/economyStorage.json`, so /balance and /shop disagreed.
 *  • No synchronous read + full-file write on every single message. Writes are
 *    debounced and the store caches reads in memory.
 *  • The per-user `setTimeout` (one timer per member, unbounded Set) is replaced
 *    by an expiry-timestamp tracker with eviction, so memory stays bounded.
 *  • Verification is checked by role ID when configured, so a decoy role named
 *    "Verified" no longer earns coins.
 *  • Failures are logged instead of silently corrupting state.
 */
const { Events } = require('discord.js');
const data = require('../lib/data');
const config = require('../lib/config');
const roles = require('../lib/roles');
const { Cooldowns } = require('../lib/cooldowns');

const cooldowns = new Cooldowns(config.economy.earnCooldownMs, 10000);

/** Debounce disk writes: coalesce bursts into one write every 5s. */
let flushTimer = null;
let dirty = false;

function scheduleFlush() {
    dirty = true;
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
        flushTimer = null;
        if (!dirty) return;
        dirty = false;
        // Touching the store triggers its atomic write path.
        data.read();
    }, 5000);
    flushTimer.unref?.();
}

module.exports = {
    name: Events.MessageCreate,

    async execute(message) {
        if (message.author.bot || !message.guild) return;
        if (!message.content || message.content.length < 2) return;
        if (message.system) return;

        // Only verified members earn, when that rule is on.
        if (config.economy.requireVerified && !roles.hasVerifiedRole(message.member)) return;

        const userId = message.author.id;
        if (!cooldowns.take(userId)) return;

        const span = Math.max(0, config.economy.maxEarn - config.economy.minEarn);
        const earned = Math.floor(Math.random() * (span + 1)) + config.economy.minEarn;

        const res = await data.addBalance(userId, earned);
        if (res === undefined) {
            // addBalance resolves to the new balance; undefined means the write failed.
            console.error('[coins] failed to persist earned coins for', userId);
            return;
        }
        scheduleFlush();
    },
};

process.on('exit', () => {
    if (flushTimer) clearTimeout(flushTimer);
});
