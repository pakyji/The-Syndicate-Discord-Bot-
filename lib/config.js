/**
 * Central configuration.
 *
 * Every channel / role / user ID that used to be hardcoded across 11 files now
 * lives here, read from environment variables. The defaults are the ORIGINAL
 * hardcoded values from the repo, so an existing deployment keeps working with
 * zero changes — but you can now override any of them from `.env` without
 * touching source code.
 */
require('dotenv').config();

const env = process.env;

function id(value) {
    const v = String(value || '').trim();
    return /^\d{15,25}$/.test(v) ? v : null;
}

function idList(value) {
    return String(value || '')
        .split(',')
        .map((s) => s.trim())
        .filter((s) => /^\d{15,25}$/.test(s));
}

function strList(value, fallback = []) {
    const raw = String(value || '').trim();
    if (!raw) return fallback;
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

function bool(value, fallback = false) {
    if (value === undefined || value === null || value === '') return fallback;
    return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function num(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

/** num() that is also forced inside [lo, hi] — for limits and percentages. */
function clampedNum(value, fallback, lo, hi) {
    return Math.min(hi, Math.max(lo, num(value, fallback)));
}

function firstId(...values) {
    for (const v of values) {
        const parsed = id(v);
        if (parsed) return parsed;
    }
    return null;
}

/* ------------------------------------------------------------------ *
 * Version — single source of truth for the update announcement
 * ------------------------------------------------------------------ */
function readVersion() {
    try {
        return JSON.parse(
            require('fs').readFileSync(require('path').join(__dirname, '..', 'package.json'), 'utf8'),
        ).version || '0.0.0';
    } catch {
        return '0.0.0';
    }
}

/** Short git SHA when the deploy is a git checkout; null otherwise. */
function readCommit() {
    try {
        return require('child_process')
            .execSync('git rev-parse --short HEAD', { cwd: require('path').join(__dirname, '..'), stdio: ['ignore', 'pipe', 'ignore'] })
            .toString().trim() || null;
    } catch {
        return null;
    }
}

const config = {
    token: env.DISCORD_TOKEN || null,
    guildId: id(env.GUILD_ID),
    clientId: id(env.CLIENT_ID),

    /** Read from package.json — bump it to trigger the "bot is live" announcement. */
    version: readVersion(),
    commit: readCommit(),
    startedAt: Date.now(),

    channels: {
        errorLog: id(env.LOG_CHANNEL_ID) || '902047746624749588',
        welcome: id(env.WELCOME_CHANNEL_ID) || '901709300383227934',
        goodbye: id(env.GOODBYE_CHANNEL_ID) || '901709744421629972',
        translation: id(env.TRANSLATION_CHANNEL_ID) || '1538595475794563167',
        report: id(env.REPORT_CHANNEL_ID) || '1553912075494105139',
        helperAnnounce: id(env.HELPER_CHANNEL_ID) || '1536500109154451618',
        autoDrops: id(env.AUTO_DROP_CHANNEL_ID) || '1536498743505846393',
        verifiedPing: id(env.VERIFIED_PING_CHANNEL_ID) || '1552721386244407357',
        greetingEnglish: id(env.GREETING_CHANNEL_EN) || '1552721386244407357',
        greetingItalian: id(env.GREETING_CHANNEL_IT) || '1537221793922940928',
        lfgMain: id(env.MAIN_LFG_CHANNEL_ID) || '1535656533919014932',
        lfgItalian: id(env.ITALIAN_LFG_CHANNEL_ID) || '1537221793922940928',
        pc: id(env.PC_CHANNEL_ID) || '1535658134230671370',
        ps4: id(env.PS4_CHANNEL_ID) || '901702088738865172',
        ps5: id(env.PS5_CHANNEL_ID) || '1550856575495839824',
        giveaway: id(env.GIVEAWAY_CHANNEL_ID) || '1546252181920022538',
    },

    /**
     * Role IDs are strongly preferred over names: name lookups let anyone with
     * Manage Roles create a decoy "Verified" role and be treated as verified.
     * If a role ID is not configured we fall back to the legacy name match.
     */
    roles: {
        verifiedId: id(env.VERIFIED_ROLE_ID),
        verifiedName: env.VERIFIED_ROLE_NAME || 'Verified',
        helperId: id(env.HELPER_ROLE_ID),
        helperName: env.HELPER_ROLE_NAME || 'Helper',
    },

    /** Members who receive report DMs. */
    staffIds: idList(env.STAFF_IDS).length
        ? idList(env.STAFF_IDS)
        : ['877175223504478218', '906193555498885120', '901459542976630865', '1553477223003201576'],

    /**
     * Legacy auto-promotion target from events/helperSetup.js.
     * DISABLED by default — auto-granting a role to a hardcoded account on every
     * boot is a privilege-escalation path if that account is ever compromised.
     * Use the /promote command instead, or set HELPER_MEMBER_ID to re-enable.
     */
    autoHelperMemberId: id(env.HELPER_MEMBER_ID),
    autoHelperEnabled: bool(env.AUTO_HELPER_ENABLED, false),

    moderation: {
        antiLink: bool(env.ANTILINK_DEFAULT, true),
        antiBadWords: bool(env.ANTIBADWORDS_DEFAULT, true),
        antiSpam: bool(env.ANTISPAM_DEFAULT, true),
        blockedLinks: strList(env.BLOCKED_LINKS, ['discord.gg', 't.me']),
        badWords: strList(env.BAD_WORDS, []),
        /** Max messages inside the window before a spam timeout triggers. */
        spamLimit: num(env.SPAM_LIMIT, 5),
        spamWindowMs: num(env.SPAM_WINDOW_MS, 5000),
        spamTimeoutMs: num(env.SPAM_TIMEOUT_MS, 60000),
        /** Warn a user after this many duplicate messages in the window. */
        duplicateLimit: num(env.DUPLICATE_LIMIT, 3),
    },

    economy: {
        /** Coins earned per eligible message. */
        minEarn: num(env.COIN_MIN_EARN, 5),
        maxEarn: num(env.COIN_MAX_EARN, 15),
        earnCooldownMs: num(env.COIN_COOLDOWN_MS, 60000),
        /** Only members holding this role earn coins. */
        requireVerified: bool(env.COIN_REQUIRE_VERIFIED, true),
    },

    levels: {
        xpPerMessage: num(env.XP_PER_MESSAGE, 15),
        xpCooldownMs: num(env.XP_COOLDOWN_MS, 60000),
        /** XP needed for level N is N * this multiplier. */
        xpPerLevelMultiplier: num(env.XP_PER_LEVEL_MULTIPLIER, 100),
        announceLevelUps: bool(env.ANNOUNCE_LEVEL_UPS, true),
    },

    translation: {
        enabled: bool(env.TRANSLATION_ENABLED, true),
        targetLang: env.TRANSLATION_TARGET_LANG || 'en',
        requestTimeoutMs: num(env.TRANSLATION_TIMEOUT_MS, 5000),
        maxTextLength: num(env.TRANSLATION_MAX_LENGTH, 500),
        /**
         * Deleting the author's original message after translating is destructive
         * (loses edit history, replies, reactions) and surprises users.
         * Off by default now; set TRANSLATION_DELETE_ORIGINAL=true to restore it.
         */
        deleteOriginal: bool(env.TRANSLATION_DELETE_ORIGINAL, false),
    },

    mediaEmbed: {
        /**
         * OFF by default: the original deleted members' own messages whenever they
         * posted a Spotify/TikTok/YouTube link, in every channel. Destructive.
         */
        enabled: bool(env.MEDIA_EMBED_ENABLED, false),
        /** Empty = all channels (when enabled). */
        channels: idList(env.MEDIA_EMBED_CHANNELS),
        deleteOriginal: bool(env.MEDIA_EMBED_DELETE_ORIGINAL, false),
    },

    verifiedPing: {
        enabled: bool(env.VERIFIED_PING_ENABLED, true),
        intervalMs: num(env.VERIFIED_PING_INTERVAL_MS, 30 * 60 * 1000),
        cooldownMs: num(env.VERIFIED_PING_COOLDOWN_MS, 3 * 60 * 60 * 1000),
        /** Was Europe/Paris in code while greetings used Europe/Rome — now consistent. */
        timezone: env.BOT_TIMEZONE || 'Europe/Rome',
        activeFromHour: num(env.VERIFIED_PING_FROM_HOUR, 6),
        activeToHour: num(env.VERIFIED_PING_TO_HOUR, 23),
        /** Max members pinged in one message, to stay clear of rate limits. */
        maxPings: num(env.VERIFIED_PING_MAX, 50),
    },

    twitch: {
        clientId: env.TWITCH_CLIENT_ID || null,
        clientSecret: env.TWITCH_CLIENT_SECRET || null,
        pollIntervalMs: num(env.TWITCH_POLL_MS, 60000),
    },

    /* ------------------------------------------------------------------ *
     * Music (YouTube via play-dl + @discordjs/voice)
     * ------------------------------------------------------------------ */
    music: {
        /**
         * ON by default: the whole feature is opt-in per use, and the voice
         * dependencies are declared in package.json. Set MUSIC_ENABLED=false to
         * hide every /music subcommand and skip loading the player entirely —
         * useful on hosts where the opus encoder cannot be built.
         */
        enabled: bool(env.MUSIC_ENABLED, true),
        defaultVolume: clampedNum(env.MUSIC_DEFAULT_VOLUME, 80, 0, 200),
        maxQueueLength: clampedNum(env.MUSIC_MAX_QUEUE, 200, 1, 1000),
        /** Per-track ceiling. Anything longer is almost always a 10-hour loop video. */
        maxTrackMinutes: clampedNum(env.MUSIC_MAX_TRACK_MINUTES, 90, 1, 720),
        /** Leave the voice channel after this long with nobody listening. */
        idleDisconnectMs: clampedNum(env.MUSIC_IDLE_DISCONNECT_MINUTES, 5, 1, 120) * 60 * 1000,
        /** Leave once the queue empties and nothing new arrives. */
        emptyQueueDisconnectMs: clampedNum(env.MUSIC_EMPTY_QUEUE_MINUTES, 2, 1, 60) * 60 * 1000,
        /** How long a YouTube search may take before we give up. */
        searchTimeoutMs: clampedNum(env.MUSIC_SEARCH_TIMEOUT_MS, 15000, 3000, 60000),
        maxPlaylistsPerRequest: clampedNum(env.MUSIC_MAX_PLAYLIST_ITEMS, 50, 1, 200),
        /** Voice channels the bot may never join. */
        blockedChannelIds: idList(env.MUSIC_BLOCKED_CHANNELS),
        /** Per-member cooldown on /music play, to stop queue flooding. */
        playCooldownMs: clampedNum(env.MUSIC_PLAY_COOLDOWN_MS, 3000, 0, 60000),
    },

    /* ------------------------------------------------------------------ *
     * Update announcement — fires ONLY when the version in package.json changes
     * ------------------------------------------------------------------ */
    announce: {
        /**
         * ON by default because this is the behaviour that was asked for: deploy a
         * new version and the server is told the bot is live. It is deliberately
         * tied to a VERSION CHANGE, not to every boot, so a crash-loop cannot spam
         * the server with @everyone pings.
         */
        enabled: bool(env.ANNOUNCE_ENABLED, true),
        pingEveryone: bool(env.ANNOUNCE_PING_EVERYONE, true),
        /** Falls back to the existing announcement channel, then the welcome channel. */
        channelId: firstId(env.ANNOUNCE_CHANNEL_ID, env.UPDATE_CHANNEL_ID, env.HELPER_CHANNEL_ID)
            || '1536500109154451618',
        /** How many changelog entries to quote in the message. */
        maxChangelogItems: clampedNum(env.ANNOUNCE_CHANGELOG_ITEMS, 8, 0, 25),
        /* --- Safety net, in case the version keeps changing (redeploy loop) --- */
        maxPerHour: clampedNum(env.ANNOUNCE_MAX_PER_HOUR, 3, 1, 24),
        /** Never announce again for a version that was already announced. */
        oncePerVersion: bool(env.ANNOUNCE_ONCE_PER_VERSION, true),
        /**
         * The very first boot has no stored version. Announcing then is what a
         * first deployment wants ("the bot is live!"), so it is ON by default.
         * Set this to false to record the version silently on a first install.
         */
        onFirstBoot: bool(env.ANNOUNCE_ON_FIRST_BOOT, true),
    },

    /** Rotating presence strings. */
    statuses: strList(env.BOT_STATUSES, [
        'Visual Studio Code',
        'Ubuntu/Linux',
        'The Syndicate - Community Bot',
    ]),
    statusRotateMs: num(env.STATUS_ROTATE_MS, 30 * 60 * 1000),

    paths: {
        data: env.DATA_DIR || require('path').join(__dirname, '..', 'data'),
    },
};

/** Warn loudly once at boot instead of failing obscurely later. */
config.validate = function validate() {
    const problems = [];
    if (!config.token) problems.push('DISCORD_TOKEN is not set');
    if (!config.guildId) problems.push('GUILD_ID is not set (commands will register globally and take up to 1h to appear)');
    if (config.music.enabled && !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)/.test(config.version)) {
        problems.push(`version "${config.version}" in package.json is not valid semver — the update announcement compares versions`);
    }
    return problems;
};

module.exports = config;
