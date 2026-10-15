/**
 * Unified persistent user data.
 *
 * The original repo kept four disconnected JSON stores:
 *   coins.json                              -> earned coins
 *   commands/economy/economyStorage.json    -> spent/mined coins
 *   commands/economy/syndicateStorage.json  -> syndicate game
 *   (levels & warnings were in-memory only and lost on every restart)
 *
 * Earning and spending touched *different files*, so /balance could show 500
 * coins while /shop saw 0. Everything now lives in one store with one schema,
 * and the legacy files are migrated in automatically on first boot.
 *
 * Shape:
 *   {
 *     users: { "<userId>": { balance, xp, level, inventory, warnings, meta } },
 *     guilds: { "<guildId>": { antiLink, antiBadWords, antiSpam, blockedLinks, badWords } },
 *     twitch: { "<guildId>": { channels: [...], lastLive: {} } },
 *     syndicate: { active: {...} },
 *     meta: { migratedAt, version }
 *   }
 */
const path = require('path');
const store = require('./store');
const config = require('./config');

const DATA_FILE = path.join(config.paths.data, 'store.json');

const EMPTY = {
    version: 2,
    users: {},
    guilds: {},
    twitch: {},
    syndicate: { active: null },
    meta: {},
};

function blankUser() {
    return {
        wallet: 0,
        bank: 0,
        xp: 0,
        level: 1,
        /** itemId -> quantity. Matches the shape the economy commands already use. */
        inventory: {},
        warnings: [],
        meta: { createdAt: Date.now() },
    };
}

/* ------------------------------------------------------------------ *
 * Shape normalisation
 * ------------------------------------------------------------------ */
/**
 * ⭐ A stored file that is missing a top-level key used to crash the migration:
 * `data.meta.migratedAt = ...` threw "Cannot set properties of undefined", and
 * `data.syndicate.legacy = ...` would have thrown the same way. That happens for
 * any store.json written by an older schema, partially restored from a backup, or
 * hand-edited — and because `read()` runs the migration on EVERY access, the whole
 * bot broke, not just one command.
 *
 * Every consumer now sees a complete shape regardless of what is on disk.
 */
function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normaliseShape(data) {
    if (!isPlainObject(data)) return structuredClone(EMPTY);
    if (!isPlainObject(data.users)) data.users = {};
    if (!isPlainObject(data.guilds)) data.guilds = {};
    if (!isPlainObject(data.twitch)) data.twitch = {};
    if (!isPlainObject(data.syndicate)) data.syndicate = structuredClone(EMPTY.syndicate);
    if (!isPlainObject(data.meta)) data.meta = {};
    if (!Number.isFinite(data.version)) data.version = EMPTY.version;
    return data;
}

/** Repair a single user record that predates a field being added. */
function normaliseUser(u) {
    const base = blankUser();
    if (!isPlainObject(u)) return base;
    return {
        ...base,
        ...u,
        wallet: Math.max(0, Number(u.wallet) || 0),
        bank: Math.max(0, Number(u.bank) || 0),
        xp: Math.max(0, Number(u.xp) || 0),
        level: Math.max(1, Math.floor(Number(u.level) || 1)),
        inventory: isPlainObject(u.inventory) ? u.inventory : {},
        warnings: Array.isArray(u.warnings) ? u.warnings : [],
        meta: isPlainObject(u.meta) ? u.meta : { createdAt: Date.now() },
    };
}

/* ------------------------------------------------------------------ *
 * One-time migration from the legacy fragmented files
 * ------------------------------------------------------------------ */
function migrateLegacy(raw) {
    const data = normaliseShape(raw);
    if (data.meta.migratedAt) return data;

    const root = path.join(__dirname, '..');
    const legacySources = [
        // [file, kind]
        [path.join(root, 'coins.json'), 'coins'],
        [path.join(root, 'commands', 'economy', 'economyStorage.json'), 'economy'],
        [path.join(root, 'commands', 'economy', 'syndicateStorage.json'), 'syndicate'],
    ];

    let migratedUsers = 0;

    for (const [file, kind] of legacySources) {
        let legacy;
        try {
            legacy = store.read(file, null);
        } catch {
            continue;
        }
        if (!legacy || typeof legacy !== 'object') continue;

        if (kind === 'syndicate') {
            // Syndicate game state was free-form; preserve it verbatim.
            if (Object.keys(legacy).length) data.syndicate.legacy = legacy;
            continue;
        }

        for (const [userId, value] of Object.entries(legacy)) {
            if (!/^\d{15,25}$/.test(userId)) continue;
            if (!data.users[userId]) data.users[userId] = blankUser();
            const u = data.users[userId];

            if (kind === 'coins') {
                // coins.json was a flat { userId: number }
                const amount = typeof value === 'number' ? value : Number(value && value.coins) || 0;
                if (Number.isFinite(amount) && amount > u.wallet) u.wallet = amount;
            } else {
                // economyStorage.json was { userId: { wallet, bank, inventory } }
                const wallet = Number(value && value.wallet) || 0;
                const bank = Number(value && value.bank) || 0;
                if (wallet > u.wallet) u.wallet = wallet;
                if (bank > u.bank) u.bank = bank;
                if (value && value.inventory && typeof value.inventory === 'object') {
                    for (const [itemId, qty] of Object.entries(value.inventory)) {
                        const n = Number(qty) || 0;
                        if (n > 0) u.inventory[itemId] = Math.max(Number(u.inventory[itemId]) || 0, n);
                    }
                }
            }
            u.meta[`migratedFrom_${kind}`] = true;
            migratedUsers += 1;
        }
    }

    // Legacy moderation settings
    const securityFile = path.join(root, 'commands', 'moderation', 'securityStorage.json');
    const security = store.read(securityFile, null);
    if (security && typeof security === 'object') {
        data.meta.legacySecurity = security;
    }

    data.meta.migratedAt = new Date().toISOString();
    data.meta.migratedUsers = migratedUsers;
    if (migratedUsers) {
        console.log(`[data] migrated ${migratedUsers} legacy coin records into ${DATA_FILE}`);
    }
    return data;
}

/* ------------------------------------------------------------------ *
 * Low-level access
 * ------------------------------------------------------------------ */
function read() {
    return migrateLegacy(store.read(DATA_FILE, structuredClone(EMPTY)));
}

async function mutate(fn) {
    const res = await store.mutate(DATA_FILE, structuredClone(EMPTY), async (raw) => {
        const data = migrateLegacy(raw);
        const result = await fn(data);
        // A mutation may return a partial object; normalise it the same way a
        // file read is normalised so one sloppy writer cannot break every reader.
        return result === undefined ? data : normaliseShape(result);
    });
    return res;
}

function user(userId) {
    const data = read();
    return normaliseUser(data.users[userId]);
}

async function updateUser(userId, fn) {
    return mutate((data) => {
        const current = normaliseUser(data.users[userId]);
        const result = fn(current);
        // ⭐ The callback's return value is the USER RECORD. Treating it as the
        // whole document (as an earlier revision did) meant any callback that
        // returned an object wiped every other user, guild and setting in the
        // store — silent, total data loss on the first write.
        data.users[userId] = result === undefined ? current : normaliseUser(result);
        return data;
    });
}

/* ------------------------------------------------------------------ *
 * Economy
 * ------------------------------------------------------------------ */
/** Total liquid + banked coins. */
function getBalance(userId) {
    const u = user(userId);
    return (Number(u.wallet) || 0) + (Number(u.bank) || 0);
}

function getWallet(userId) {
    return Number(user(userId).wallet) || 0;
}

function getBank(userId) {
    return Number(user(userId).bank) || 0;
}

async function addBalance(userId, amount) {
    let newBalance = null;
    await updateUser(userId, (u) => {
        u.wallet = (Number(u.wallet) || 0) + amount;
        newBalance = u.wallet;
    });
    return newBalance;
}

async function setWallet(userId, amount) {
    let wallet = 0;
    await updateUser(userId, (u) => {
        u.wallet = Math.max(0, Number(amount) || 0);
        wallet = u.wallet;
    });
    return wallet;
}

async function deposit(userId, amount) {
    let result = { ok: false, wallet: 0, bank: 0 };
    await updateUser(userId, (u) => {
        const wallet = Number(u.wallet) || 0;
        const bank = Number(u.bank) || 0;
        if (amount <= 0 || amount > wallet) {
            result = { ok: false, wallet, bank };
            return;
        }
        u.wallet = wallet - amount;
        u.bank = bank + amount;
        result = { ok: true, wallet: u.wallet, bank: u.bank };
    });
    return result;
}

async function withdraw(userId, amount) {
    let result = { ok: false, wallet: 0, bank: 0 };
    await updateUser(userId, (u) => {
        const wallet = Number(u.wallet) || 0;
        const bank = Number(u.bank) || 0;
        if (amount <= 0 || amount > bank) {
            result = { ok: false, wallet, bank };
            return;
        }
        u.bank = bank - amount;
        u.wallet = wallet + amount;
        result = { ok: true, wallet: u.wallet, bank: u.bank };
    });
    return result;
}

/**
 * Atomic spend: succeeds only if the balance covers `amount`.
 * Returns { ok, balance } — callers must check `ok` before granting an item.
 */
/**
 * Atomic spend from the wallet: succeeds only if funds cover `amount`.
 * Callers MUST check `ok` before granting an item.
 */
async function spend(userId, amount) {
    let ok = false;
    let balance = 0;
    await updateUser(userId, (u) => {
        const current = Number(u.wallet) || 0;
        if (amount > 0 && current >= amount) {
            u.wallet = current - amount;
            ok = true;
        }
        balance = u.wallet;
    });
    return { ok, balance };
}

/** Add `qty` of `itemId` (map shape: itemId -> quantity). */
async function addItem(userId, itemId, qty = 1) {
    await updateUser(userId, (u) => {
        if (!u.inventory || typeof u.inventory !== 'object' || Array.isArray(u.inventory)) u.inventory = {};
        u.inventory[itemId] = (Number(u.inventory[itemId]) || 0) + qty;
    });
}

/** Remove up to `qty` of `itemId`. Returns false if the user does not have enough. */
async function removeItem(userId, itemId, qty = 1) {
    let removed = false;
    await updateUser(userId, (u) => {
        if (!u.inventory || typeof u.inventory !== 'object') u.inventory = {};
        const have = Number(u.inventory[itemId]) || 0;
        if (have < qty) return;
        const left = have - qty;
        if (left > 0) u.inventory[itemId] = left;
        else delete u.inventory[itemId];
        removed = true;
    });
    return removed;
}

function getInventory(userId) {
    const inv = user(userId).inventory;
    return inv && typeof inv === 'object' && !Array.isArray(inv) ? inv : {};
}

function hasItem(userId, itemId, qty = 1) {
    return (Number(getInventory(userId)[itemId]) || 0) >= qty;
}

/** Sorted descending by balance, for the leaderboard. */
function leaderboard(limit = 10) {
    const data = read();
    return Object.entries(data.users)
        .map(([id, u]) => ({
            id,
            wallet: Number(u.wallet) || 0,
            bank: Number(u.bank) || 0,
            balance: (Number(u.wallet) || 0) + (Number(u.bank) || 0),
            level: Number(u.level) || 1,
        }))
        .sort((a, b) => b.balance - a.balance)
        .slice(0, limit);
}

/* ------------------------------------------------------------------ *
 * Levels
 * ------------------------------------------------------------------ */
function getLevel(userId) {
    const u = user(userId);
    return { xp: Number(u.xp) || 0, level: Number(u.level) || 1 };
}

function xpForLevel(level) {
    return level * config.levels.xpPerLevelMultiplier;
}

/**
 * Award XP. Returns { levelledUp, level } — persisted, so it survives restarts.
 * (The original kept levels in a plain Map and wiped them on every boot,
 * while /level returned a hardcoded fake string.)
 */
async function addXp(userId, amount = config.levels.xpPerMessage) {
    const result = { levelledUp: false, level: 1, xp: 0 };
    await updateUser(userId, (u) => {
        u.xp = (Number(u.xp) || 0) + amount;
        u.level = Number(u.level) || 1;
        let required = xpForLevel(u.level);
        while (u.xp >= required) {
            u.xp -= required;
            u.level += 1;
            result.levelledUp = true;
            required = xpForLevel(u.level);
        }
        result.level = u.level;
        result.xp = u.xp;
        result.required = required;
    });
    return result;
}

/** Rank (1-based) by XP-derived level then XP. */
function rank(userId) {
    const data = read();
    const rows = Object.entries(data.users)
        .map(([id, u]) => ({ id, level: Number(u.level) || 1, xp: Number(u.xp) || 0 }))
        .sort((a, b) => b.level - a.level || b.xp - a.xp);
    const idx = rows.findIndex((r) => r.id === userId);
    return idx === -1 ? rows.length + 1 : idx + 1;
}

/* ------------------------------------------------------------------ *
 * Moderation — warnings (were memory-only and lost on restart)
 * ------------------------------------------------------------------ */
function getWarnings(userId) {
    const w = user(userId).warnings;
    return Array.isArray(w) ? w : [];
}

async function addWarning(userId, { reason, moderatorId, guildId }) {
    let count = 0;
    await updateUser(userId, (u) => {
        if (!Array.isArray(u.warnings)) u.warnings = [];
        u.warnings.push({
            id: u.warnings.length + 1,
            reason: reason || 'No reason provided',
            moderatorId: moderatorId || null,
            guildId: guildId || null,
            time: Date.now(),
        });
        count = u.warnings.length;
    });
    return count;
}

/** Remove one warning by 1-based index. Returns the removed entry or null. */
async function removeWarning(userId, warnId) {
    let removed = null;
    await updateUser(userId, (u) => {
        if (!Array.isArray(u.warnings) || u.warnings.length === 0) return;
        if (warnId < 1 || warnId > u.warnings.length) return;
        removed = u.warnings.splice(warnId - 1, 1)[0];
        // Re-number so IDs stay stable for mods.
        u.warnings.forEach((w, i) => { w.id = i + 1; });
    });
    return removed;
}

async function clearWarnings(userId) {
    let cleared = 0;
    await updateUser(userId, (u) => {
        cleared = Array.isArray(u.warnings) ? u.warnings.length : 0;
        u.warnings = [];
    });
    return cleared;
}

/* ------------------------------------------------------------------ *
 * Guild settings
 * ------------------------------------------------------------------ */
function guildDefaults() {
    return {
        antiLink: config.moderation.antiLink,
        antiBadWords: config.moderation.antiBadWords,
        antiSpam: config.moderation.antiSpam,
        blockedLinks: [...config.moderation.blockedLinks],
        badWords: [...config.moderation.badWords],
        // Anti-spam thresholds (per-guild overrides of the .env defaults).
        spamLimit: config.moderation.spamLimit,
        spamWindowMs: config.moderation.spamWindowMs,
        spamTimeoutMs: config.moderation.spamTimeoutMs,
        // Voice-channel ID of the member counter (see lib/guildStats.js).
        statsChannelId: null,
    };
}

function getGuild(guildId) {
    const data = read();
    if (!data.guilds[guildId]) {
        // Seed from the legacy securityStorage.json if it exists, else defaults.
        const legacy = data.meta && data.meta.legacySecurity;
        const base = guildDefaults();
        data.guilds[guildId] = legacy
            ? {
                ...base,
                antiLink: legacy.antiLinkStatus !== false,
                antiBadWords: legacy.antiBadWordsStatus !== false,
                antiSpam: config.moderation.antiSpam,
                blockedLinks: Array.isArray(legacy.customBlockedLinks) ? legacy.customBlockedLinks : base.blockedLinks,
                // Drop the placeholder words shipped in the repo sample file.
                badWords: Array.isArray(legacy.customBadWords)
                    ? legacy.customBadWords.filter((w) => w && !/^badword\d*$/i.test(w))
                    : base.badWords,
            }
            : base;
        // Deliberately NOT persisted here: this is a read path, and a bare
        // store.write() outside the mutation lock could interleave with a
        // concurrent mutate() and lose that write. The defaults are recomputed
        // identically on the next read, and updateGuild() persists for real.
    }
    return data.guilds[guildId];
}

async function updateGuild(guildId, fn) {
    return mutate((data) => {
        if (!isPlainObject(data.guilds[guildId])) data.guilds[guildId] = guildDefaults();
        const result = fn(data.guilds[guildId]);
        // Merge the callback's result back into ITS OWN slot and return the whole
        // document. Returning `result` directly replaced the entire store with a
        // single guild's settings whenever the callback returned a new object.
        if (isPlainObject(result)) data.guilds[guildId] = { ...data.guilds[guildId], ...result };
        return data;
    });
}

/* ------------------------------------------------------------------ *
 * Twitch + syndicate blobs
 * ------------------------------------------------------------------ */
function getTwitch(guildId) {
    const data = read();
    return data.twitch[guildId] || { channels: [], lastLive: {} };
}

async function updateTwitch(guildId, fn) {
    return mutate((data) => {
        if (!isPlainObject(data.twitch[guildId])) data.twitch[guildId] = { channels: [], lastLive: {} };
        const result = fn(data.twitch[guildId]);
        // Merge the callback's result back into ITS OWN slot and return the whole
        // document. Returning `result` directly replaced the entire store with a
        // single guild's settings whenever the callback returned a new object.
        if (isPlainObject(result)) data.twitch[guildId] = { ...data.twitch[guildId], ...result };
        return data;
    });
}

/**
 * Per-user Syndicate mobile-app state (replaces the old syndicateStorage.json).
 * Shape: { chats: {...}, currentPage: 0 }
 */
function getSyndicateApp(userId) {
    const u = user(userId);
    return u.app && typeof u.app === 'object' ? u.app : { chats: {}, currentPage: 0 };
}

async function updateSyndicateApp(userId, fn) {
    return updateUser(userId, (u) => {
        if (!isPlainObject(u.app)) u.app = { chats: {}, currentPage: 0 };
        if (!isPlainObject(u.app.chats)) u.app.chats = {};
        if (!Number.isFinite(u.app.currentPage)) u.app.currentPage = 0;
        const out = fn(u.app);
        if (out === undefined) return u;
        // ⭐ MERGE rather than replace: callers that do `{ ...app, chats }` keep
        // every other key, but a caller returning only `{ chats }` used to wipe
        // `currentPage` (and anything added later) from the user's app state.
        u.app = { ...u.app, ...(isPlainObject(out) ? out : {}) };
        if (!isPlainObject(u.app.chats)) u.app.chats = {};
        return u;
    });
}

function getSyndicate() {
    return read().syndicate || { active: null };
}

async function updateSyndicate(fn) {
    return mutate((data) => {
        if (!isPlainObject(data.syndicate)) data.syndicate = { active: null };
        const result = fn(data.syndicate);
        // Same rule as updateGuild: merge into the slot, return the document.
        if (isPlainObject(result)) data.syndicate = { ...data.syndicate, ...result };
        return data;
    });
}

module.exports = {
    DATA_FILE,
    read,
    mutate,
    user,
    updateUser,
    getBalance,
    getWallet,
    getBank,
    addBalance,
    setWallet,
    deposit,
    withdraw,
    spend,
    addItem,
    removeItem,
    hasItem,
    getInventory,
    leaderboard,
    getLevel,
    addXp,
    xpForLevel,
    rank,
    getWarnings,
    addWarning,
    removeWarning,
    clearWarnings,
    getGuild,
    updateGuild,
    guildDefaults,
    getTwitch,
    updateTwitch,
    getSyndicate,
    updateSyndicate,
    getSyndicateApp,
    normaliseUser,
    normaliseShape,
    updateSyndicateApp,
};
