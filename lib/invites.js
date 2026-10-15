/**
 * Single shared invite cache.
 *
 * BUG FIXED: the repo maintained THREE independent invite caches that never saw
 * each other's data —
 *   • events/inviteTracker.js  -> a module-level `Collection`
 *   • events/ready.js          -> `global.invitesCache`
 *   • events/guildMemberAdd.js -> `global.invitesCache || new Map()` captured at
 *                                 MODULE LOAD TIME
 *
 * Because index.js requires every event file before the client logs in,
 * `global.invitesCache` was still undefined when guildMemberAdd.js ran, so it
 * captured a permanent empty Map. Result: `oldInvites.get(...)` always returned
 * an empty Map, the "Invited By" field never resolved, and the cache written
 * back after a join went into a different Map than the one inviteTracker used.
 *
 * Everything now reads and writes this one object.
 */
const { Collection } = require('discord.js');

/** guildId -> Map<inviteCode, uses> */
const cache = new Collection();

/** Snapshot a guild's current invites into the shared cache. */
async function warm(guild) {
    try {
        const invites = await guild.invites.fetch();
        cache.set(guild.id, new Map(invites.map((inv) => [inv.code, inv.uses])));
        return true;
    } catch (error) {
        // 50001 = Missing Permissions (no Manage Guild). Normal, not an error.
        if (error.code !== 50001) {
            console.error(`[invites] could not fetch invites for ${guild.id}:`, error.message);
        }
        cache.set(guild.id, new Map());
        return false;
    }
}

async function warmAll(client) {
    let ok = 0;
    for (const guild of client.guilds.cache.values()) {
        if (await warm(guild)) ok += 1;
    }
    console.log(`[invites] cache warmed for ${ok}/${client.guilds.cache.size} guild(s)`);
    return ok;
}

/**
 * Diff the cached snapshot against the guild's live invites to find which code
 * gained a use — i.e. who invited the new member.
 * @returns {Promise<{inviter: import('discord.js').User|null, code: string|null}>}
 */
async function findInviter(guild) {
    const previous = cache.get(guild.id) || new Map();

    let current;
    try {
        const invites = await guild.invites.fetch();
        current = new Map(invites.map((inv) => [inv.code, { uses: inv.uses, inviterId: inv.inviter?.id ?? null }]));
    } catch {
        return { inviter: null, code: null };
    }

    let matchedCode = null;
    let inviterId = null;

    for (const [code, entry] of current) {
        const before = previous.get(code);
        if (before !== undefined && entry.uses > before) {
            matchedCode = code;
            inviterId = entry.inviterId;
            break;
        }
    }

    // Vanity URLs and widget invites do not appear in guild.invites — fall back
    // to the guild's vanity code if it exists and nothing else matched.
    if (!matchedCode && guild.vanityURLCode) {
        matchedCode = guild.vanityURLCode;
    }

    // Refresh the snapshot so the next join diffs against fresh data.
    cache.set(guild.id, new Map([...current].map(([code, entry]) => [code, entry.uses])));

    if (!inviterId) return { inviter: null, code: matchedCode };

    const inviter = await guild.client.users.fetch(inviterId).catch(() => null);
    return { inviter, code: matchedCode };
}

function get(guildId) {
    return cache.get(guildId) || new Map();
}

function clear() {
    cache.clear();
}

module.exports = { cache, warm, warmAll, findInviter, get, clear };
