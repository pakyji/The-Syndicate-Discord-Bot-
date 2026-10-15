/**
 * Twitch per-guild configuration, backed by the unified store.
 *
 * The original wrote a single global `commands/../twitchConfig.json` (a file
 * that was never committed), so a streamer added in one server alerted every
 * server the bot was in, and the default notification channel was hardcoded.
 *
 * Shape per guild:
 *   { notificationChannelId: string|null, streamers: string[], lastLive: {} }
 */
const store = require('./data');

const MAX_STREAMERS = 50;

function defaults() {
    return { notificationChannelId: null, streamers: [], lastLive: {} };
}

/** Synchronous read of one guild's Twitch config. */
function get(guildId) {
    if (!guildId) return defaults();
    const data = store.read();
    const cfg = data.twitch[guildId];
    if (!cfg) return defaults();
    return {
        notificationChannelId: cfg.notificationChannelId || null,
        streamers: Array.isArray(cfg.streamers) ? cfg.streamers : [],
        lastLive: cfg.lastLive && typeof cfg.lastLive === 'object' ? cfg.lastLive : {},
    };
}

async function update(guildId, fn) {
    const res = await store.updateTwitch(guildId, (cfg) => {
        if (!Array.isArray(cfg.streamers)) cfg.streamers = [];
        if (!cfg.lastLive || typeof cfg.lastLive !== 'object') cfg.lastLive = {};
        const out = fn(cfg);
        return out === undefined ? cfg : out;
    });
    return res.ok;
}

function isFull(guildId) {
    return get(guildId).streamers.length >= MAX_STREAMERS;
}

/** Twitch usernames: 4-25 chars, alphanumeric + underscore. */
function normaliseUsername(input) {
    const name = String(input || '').trim().toLowerCase().replace(/^https?:\/\/(www\.)?twitch\.tv\//, '');
    return /^[a-z0-9_]{4,25}$/.test(name) ? name : null;
}

module.exports = { defaults, get, update, isFull, normaliseUsername, MAX_STREAMERS };
