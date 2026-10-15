/**
 * Periodic "come say hi" ping to a few verified members.
 *
 * Fixes vs. the original:
 *  • Removed `await guild.members.fetch()` — a full member-list pull every 30
 *    minutes is expensive, rate-limited, and unnecessary because
 *    `role.members` is already populated for a cached guild.
 *  • The random-pick `while` loop could spin for a long time when the verified
 *    pool was small (it retried until it found 3 *distinct* IDs). Now uses a
 *    Fisher-Yates partial shuffle — O(n), always terminates.
 *  • Timezone came from `Europe/Paris` while the greeting cron used
 *    `Europe/Rome`. Both now read BOT_TIMEZONE.
 *  • Guild resolved by GUILD_ID instead of `guilds.cache.first()`.
 *  • Channel/role IDs from config; role matched by ID when configured.
 *  • Interval is tracked and cleared on shutdown.
 *  • Skips members who are offline or have recently been pinged, so the same
 *    person is not called out repeatedly.
 */
const { Events } = require('discord.js');
const config = require('../lib/config');
const roles = require('../lib/roles');

const FUNNY_MESSAGES = [
    'Hey {USERS}, what are you all sneaking around here for? Come say hi!',
    'Looks like {USERS} are gaming way too hard today. Someone check on them!',
    'Yo {USERS}! Drink some water, take a break, and step away from the screen!',
    'Where are you guys, {USERS}? Everyone in the server misses you (or maybe your snacks)!',
    'Anyone up for a session, {USERS}? The crew is waiting!',
    'Bro {USERS}, are you all still alive or did you fall asleep on your keyboards?',
];

const PING_COUNT = 3;
/** Do not ping the same member again within this window. */
const PER_MEMBER_COOLDOWN_MS = 12 * 60 * 60 * 1000;

/** Pick up to `count` distinct items without a retry loop. */
function sample(list, count) {
    const pool = [...list];
    const out = [];
    while (pool.length && out.length < count) {
        const i = Math.floor(Math.random() * pool.length);
        out.push(pool.splice(i, 1)[0]);
    }
    return out;
}

module.exports = {
    name: Events.ClientReady,
    once: true,

    execute(client) {
        if (!config.verifiedPing.enabled) {
            console.log('[verifiedPing] disabled via VERIFIED_PING_ENABLED=false');
            return;
        }
        if (!config.channels.verifiedPing) {
            console.log('[verifiedPing] VERIFIED_PING_CHANNEL_ID not set — task disabled.');
            return;
        }

        const lastPinged = new Map(); // userId -> timestamp
        let lastPingTime = 0;

        function inActiveWindow() {
            const parts = new Intl.DateTimeFormat('en-GB', {
                timeZone: config.verifiedPing.timezone,
                hour: 'numeric',
                minute: 'numeric',
                hour12: false,
            }).formatToParts(new Date());

            const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
            return hour >= config.verifiedPing.activeFromHour && hour < config.verifiedPing.activeToHour;
        }

        const timer = setInterval(async () => {
            try {
                if (!inActiveWindow()) return;

                const now = Date.now();
                if (lastPingTime && now - lastPingTime < config.verifiedPing.cooldownMs) return;

                const guild = config.guildId
                    ? client.guilds.cache.get(config.guildId)
                    : client.guilds.cache.first();
                if (!guild) return;

                const channel = guild.channels.cache.get(config.channels.verifiedPing)
                    || await guild.channels.fetch(config.channels.verifiedPing).catch(() => null);
                if (!channel || !channel.isTextBased()) return;

                const verifiedRole = await roles.getVerifiedRole(guild);
                if (!verifiedRole) return;

                // Use the cached member list — no full guild.members.fetch().
                const eligible = verifiedRole.members
                    .filter((m) => !m.user.bot)
                    .filter((m) => m.presence?.status !== 'offline')
                    .filter((m) => {
                        const at = lastPinged.get(m.id) || 0;
                        return now - at >= PER_MEMBER_COOLDOWN_MS;
                    })
                    .map((m) => m.id);

                if (!eligible.length) return;

                const picked = sample(eligible, Math.min(PING_COUNT, config.verifiedPing.maxPings));
                if (!picked.length) return;

                const mentions = picked.map((id) => `<@${id}>`).join(', ');
                const template = FUNNY_MESSAGES[Math.floor(Math.random() * FUNNY_MESSAGES.length)];

                await channel.send({
                    content: template.replace('{USERS}', mentions),
                    allowedMentions: { users: picked, parse: [] }, // mention ONLY the picked users
                });

                for (const id of picked) lastPinged.set(id, now);
                lastPingTime = now;

                // Keep the cooldown map bounded.
                if (lastPinged.size > 5000) {
                    for (const [id, at] of lastPinged) {
                        if (now - at >= PER_MEMBER_COOLDOWN_MS) lastPinged.delete(id);
                    }
                }
            } catch (error) {
                console.error('[verifiedPing] task failed:', error.message);
            }
        }, config.verifiedPing.intervalMs);

        timer.unref?.();
        client.verifiedPingTimer = timer;
        client.once('shardDisconnect', () => clearInterval(timer));
        process.on('SIGTERM', () => clearInterval(timer));
        process.on('SIGINT', () => clearInterval(timer));
    },
};
