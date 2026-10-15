/**
 * Role resolution.
 *
 * The original matched roles by NAME (`roles.cache.find(r => r.name === 'Verified')`).
 * Anyone with Manage Roles could create a decoy role called "Verified" and its
 * holders would be treated as verified — including earning coins.
 *
 * These helpers prefer a configured role ID and only fall back to the legacy
 * name match when no ID has been set.
 */
const config = require('./config');

/** Resolve a role by configured ID first, then by name. */
function findRole(guild, idValue, nameValue) {
    if (!guild) return null;
    if (idValue) {
        const byId = guild.roles.cache.get(idValue) || guild.roles.fetch(idValue).catch(() => null);
        // fetch() returns a promise; handle the sync cache hit and defer the rest.
        if (byId && typeof byId.then !== 'function') return byId;
        if (byId && typeof byId.then === 'function') {
            return byId.then((r) => r || findByName(guild, nameValue));
        }
    }
    return findByName(guild, nameValue);
}

function findByName(guild, nameValue) {
    if (!guild || !nameValue) return null;
    return guild.roles.cache.find((r) => r.name.toLowerCase() === String(nameValue).toLowerCase()) || null;
}

/** Synchronous, cache-only lookup (safe inside hot paths like messageCreate). */
function getCached(guild, idValue, nameValue) {
    if (!guild) return null;
    if (idValue && guild.roles.cache.has(idValue)) return guild.roles.cache.get(idValue);
    return findByName(guild, nameValue);
}

async function getVerifiedRole(guild) {
    const role = await Promise.resolve(findRole(guild, config.roles.verifiedId, config.roles.verifiedName));
    return role || null;
}

function hasVerifiedRole(member) {
    if (!member || !member.roles) return false;
    if (config.roles.verifiedId) return member.roles.cache.has(config.roles.verifiedId);
    return member.roles.cache.some((r) => r.name.toLowerCase() === config.roles.verifiedName.toLowerCase());
}

async function getHelperRole(guild) {
    const role = await Promise.resolve(findRole(guild, config.roles.helperId, config.roles.helperName));
    return role || null;
}

/**
 * Create a role only when explicitly allowed. Auto-creating roles on demand
 * (as the original reaction-role and verify handlers did) lets any button press
 * spawn new roles and clutter the role list.
 */
async function getOrCreateRole(guild, { id: idValue, name, color, reason, allowCreate = true }) {
    const existing = await Promise.resolve(findRole(guild, idValue, name));
    if (existing) return existing;
    if (!allowCreate) return null;
    try {
        return await guild.roles.create({ name, color, reason });
    } catch (error) {
        console.error(`[roles] could not create role "${name}":`, error.message);
        return null;
    }
}

module.exports = {
    findRole,
    findByName,
    getCached,
    getVerifiedRole,
    hasVerifiedRole,
    getHelperRole,
    getOrCreateRole,
};
