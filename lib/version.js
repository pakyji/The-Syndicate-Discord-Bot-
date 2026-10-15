/**
 * "The Syndicate is LIVE" — version-change announcement.
 *
 * Requirement: the token already lives on the host, so pushing a new version and
 * restarting should tell the server the bot is back, ping @everyone, and list what
 * changed.
 *
 * The design decision that matters: **the trigger is a version change, not a boot.**
 * Announcing on every start means a crash-loop — or a host that restarts on every
 * deploy hook — pings @everyone repeatedly, which is exactly the kind of thing that
 * gets a bot kicked from a server. So:
 *
 *   • package.json `version` is compared against the last announced version, which
 *     is persisted in data/store.json and therefore survives restarts.
 *   • Same version  → silent restart, console log only.
 *   • New version   → announce once, then record it so a restart cannot repeat it.
 *   • First boot    → announces by default (that is the "I just deployed it" case);
 *     set ANNOUNCE_ON_FIRST_BOOT=false to record the version silently instead.
 *
 * Two extra guards, because @everyone is the most abusable ping in Discord:
 *   • An hourly cap (default 3) stops a redeploy loop from spamming the server.
 *     When the cap is hit the version is NOT recorded, so the announcement still
 *     goes out on the next boot once the hour has passed.
 *   • The bot checks it actually holds Mention Everyone in the target channel and
 *     silently drops the ping rather than sending a message that looks broken.
 */
const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('./config');
const store = require('./data');

const SEMVER = /^(\d+)\.(\d+)\.(\d+)/;

/** Read CHANGELOG.md and return [{version, items:[...]}], newest first. */
function parseChangelog() {
    try {
        const fs = require('fs');
        const path = require('path');
        const raw = fs.readFileSync(path.join(__dirname, '..', 'CHANGELOG.md'), 'utf8');
        const entries = [];
        let current = null;

        for (const line of raw.split('\n')) {
            const heading = /^#{2,3}\s+\[?v?(\d+\.\d+\.\d+)\]?/.exec(line.trim());
            if (heading) {
                current = { version: heading[1], items: [] };
                entries.push(current);
                continue;
            }
            if (!current) continue;
            const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
            if (bullet && bullet[1].trim()) {
                current.items.push(bullet[1].trim().replace(/\*\*/g, ''));
            }
        }
        return entries;
    } catch {
        return [];   // no CHANGELOG.md — the announcement still works without it
    }
}

function compareSemver(a, b) {
    const pa = SEMVER.exec(String(a || '')) || [0, 0, 0, 0];
    const pb = SEMVER.exec(String(b || '')) || [0, 0, 0, 0];
    for (let i = 1; i <= 3; i++) {
        const diff = Number(pa[i]) - Number(pb[i]);
        if (diff !== 0) return diff > 0 ? 1 : -1;
    }
    return 0;
}

/** @returns {Promise<object>} what is stored about previous announcements */
async function readState() {
    const syndicate = store.getSyndicate() || {};
    return syndicate.version || { lastAnnounced: null, history: [] };
}

async function writeState(state) {
    await store.updateSyndicate((s) => ({ ...s, version: state }));
}

/**
 * Decide whether this boot should announce, WITHOUT sending anything.
 * Exported so the test suite can exercise every branch offline.
 *
 * @returns {Promise<{should:boolean, reason:string, current:string, lastAnnounced:string|null, firstBoot:boolean, throttled:boolean}>}
 */
async function evaluate({ now = Date.now(), version = config.version, state = null } = {}) {
    const current = String(version || '0.0.0');
    const stored = state || (await readState());
    const lastAnnounced = stored.lastAnnounced || null;
    const history = Array.isArray(stored.history) ? stored.history : [];
    const firstBoot = !lastAnnounced;

    const base = { current, lastAnnounced, firstBoot, throttled: false };

    if (!config.announce.enabled) {
        return { ...base, should: false, reason: 'disabled (ANNOUNCE_ENABLED=false)' };
    }
    if (!SEMVER.test(current)) {
        return { ...base, should: false, reason: `version "${current}" is not valid semver` };
    }

    // Same version already announced -> ordinary restart, stay quiet.
    if (lastAnnounced === current) {
        return { ...base, should: false, reason: `already announced ${current}` };
    }

    // Never re-announce a version that went out before (downgrade / rollback).
    if (config.announce.oncePerVersion && history.some((h) => h.version === current)) {
        return { ...base, should: false, reason: `${current} was announced in the past` };
    }

    // First ever boot: announce unless the operator opted out.
    if (firstBoot && !config.announce.onFirstBoot) {
        return { ...base, should: false, reason: 'first boot with ANNOUNCE_ON_FIRST_BOOT=false' };
    }

    // A downgrade is not an "update" — record it silently so it cannot loop.
    if (lastAnnounced && compareSemver(current, lastAnnounced) < 0) {
        return { ...base, should: false, reason: `${current} is older than ${lastAnnounced} (rollback)`, recordSilently: true };
    }

    // Hourly cap: a redeploy loop must not be able to spam @everyone.
    const recent = history.filter((h) => Number(h.at) > now - 60 * 60 * 1000);
    if (recent.length >= config.announce.maxPerHour) {
        return {
            ...base,
            should: false,
            throttled: true,
            reason: `rate limit (${recent.length}/${config.announce.maxPerHour} announcements in the last hour)`,
        };
    }

    const kind = firstBoot ? 'first-deploy' : 'update';
    return { ...base, should: true, reason: kind, kind, previous: lastAnnounced };
}

/**
 * Pick the channel to post in, with sane fallbacks.
 *
 * Exported and injectable so the whole flow can be tested against a mock gateway:
 * `client` and the resolved settings are parameters rather than module reads.
 *
 * Order: the configured channel (which must belong to the target guild) → the
 * guild's system channel → its first text channel. Falling back beats announcing
 * nothing, and the caller logs that a fallback happened.
 */
async function resolveChannel(client, { guildId = config.guildId, channelId = config.announce.channelId } = {}) {
    if (!client) return null;

    const guild = guildId
        ? await client.guilds.fetch(guildId).catch(() => null)
        : (client.guilds.cache?.first?.() || null);
    if (!guild) return null;

    const wanted = channelId ? await client.channels.fetch(channelId).catch(() => null) : null;
    // The channel must be text-based AND in the target guild — a configured ID from
    // another server would otherwise post the announcement somewhere unexpected.
    if (wanted && wanted.isTextBased?.() && (!wanted.guildId || wanted.guildId === guild.id)) {
        return { channel: wanted, guild, fallback: false };
    }

    const system = guild.systemChannel;
    if (system && system.isTextBased?.() !== false) return { channel: system, guild, fallback: true };

    const firstText = guild.channels?.cache
        ?.filter?.((c) => c.isTextBased?.() && c.type === 0)
        ?.sort?.((a, b) => (a.rawPosition || 0) - (b.rawPosition || 0))
        ?.first?.();
    return firstText ? { channel: firstText, guild, fallback: true } : null;
}

/** Build the announcement payload. Pure, so it is testable without a gateway. */
function buildAnnouncement({ decision, changelog, uptimeMs = 0, pingEveryone = true, commit = config.commit, botName = 'The Syndicate' }) {
    const previous = decision.previous || 'first deploy';
    const entry = changelog.find((c) => c.version === decision.current);
    const items = (entry?.items || []).slice(0, config.announce.maxChangelogItems);

    const lines = [
        `**${botName}** is now online running **v${decision.current}**${decision.kind === 'update' ? ` (was v${previous})` : ''}.`,
    ];
    if (commit) lines.push(`Build \`${commit}\`.`);
    if (items.length) {
        lines.push('');
        lines.push('**What is new:**');
        for (const item of items) lines.push(`• ${item.slice(0, 180)}`);
    } else {
        lines.push('');
        lines.push('*No changelog entry for this version yet — see `CHANGELOG.md`.*');
    }

    const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle('🟢 The Syndicate is LIVE')
        .setDescription(lines.join('\n').slice(0, 4000))
        .addFields(
            { name: 'Version', value: `\`v${decision.current}\``, inline: true },
            { name: 'Previous', value: decision.previous ? `\`v${decision.previous}\`` : '—', inline: true },
            { name: 'Uptime', value: formatUptime(uptimeMs), inline: true },
        )
        .setFooter({ text: 'Announced automatically on version change • /version for details' })
        .setTimestamp();

    return {
        embeds: [embed],
        // The ping goes in `content`, not the embed: mentions inside an embed are
        // rendered as text and never actually notify anyone.
        content: pingEveryone ? '@everyone' : undefined,
        allowedMentions: pingEveryone ? { parse: ['everyone'] } : { parse: [] },
    };
}

function formatUptime(ms) {
    const s = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (d) return `${d}d ${h}h`;
    if (h) return `${h}h ${m}m`;
    if (m) return `${m}m ${s % 60}s`;
    return `${s}s`;
}

/**
 * Run the whole flow. Called once from events/ready.js.
 * Never throws — a failed announcement must not stop the bot from coming online.
 */
async function announceIfUpdated(client) {
    let decision;
    try {
        decision = await evaluate();
    } catch (error) {
        console.error('[version] could not evaluate the stored version:', error.message);
        return null;
    }

    if (!decision.should) {
        // A rollback still needs recording, or every boot re-evaluates it.
        if (decision.recordSilently) {
            await record(decision.current).catch(() => {});
        }
        console.log(`[version] v${decision.current} — no announcement (${decision.reason}).`);
        return decision;
    }

    const resolved = await resolveChannel(client, {
        guildId: config.guildId,
        channelId: config.announce.channelId,
    }).catch((error) => {
        console.error('[version] could not resolve the announcement channel:', error.message);
        return null;
    });
    if (!resolved) {
        console.warn(`[version] v${decision.current} is new but no usable channel was found — nothing announced.`);
        return decision;
    }

    const { channel, guild, fallback } = resolved;

    // Can the bot actually ping @everyone HERE? If not, drop the ping rather than
    // sending a message that silently fails to notify.
    let ping = config.announce.pingEveryone;
    const me = guild.members.me;
    const channelPerms = channel.permissionsFor?.(me);
    if (ping && channelPerms && !channelPerms.has(PermissionFlagsBits.MentionEveryone)) {
        console.warn('[version] I lack Mention Everyone in that channel — sending without the ping.');
        ping = false;
    }
    if (ping && me && !me.permissions.has(PermissionFlagsBits.MentionEveryone)) {
        console.warn('[version] my role lacks Mention Everyone — sending without the ping.');
        ping = false;
    }
    if (!channelPerms || !channelPerms.has(PermissionFlagsBits.SendMessages)) {
        console.warn(`[version] I cannot send messages in #${channel.name} — nothing announced.`);
        return decision;
    }

    const payload = buildAnnouncement({
        decision,
        changelog: parseChangelog(),
        uptimeMs: Date.now() - config.startedAt,
        pingEveryone: ping,
        // Use the bot's real display name rather than a hardcoded string.
        botName: client.user?.username || 'The Syndicate',
    });

    try {
        await channel.send(payload);
        await record(decision.current);
        console.log(`[version] ✅ announced v${decision.current} in #${channel.name}${ping ? ' with @everyone' : ''}.`);
        if (fallback) {
            console.warn(`[version] ANNOUNCE_CHANNEL_ID (${config.announce.channelId}) was unusable — fell back to #${channel.name}.`);
        }
        return decision;
    } catch (error) {
        // Deliberately NOT recorded: the announcement did not land, so the next
        // boot should try again.
        console.error('[version] announcement failed to send:', error.message);
        return decision;
    }
}

/** Persist that `version` has been announced, keeping a bounded history. */
async function record(version, at = Date.now()) {
    const state = await readState();
    const history = [...(Array.isArray(state.history) ? state.history : []), { version, at }]
        .filter((h) => Number(h.at) > at - 30 * 24 * 60 * 60 * 1000)   // keep 30 days
        .slice(-50);
    await writeState({ lastAnnounced: version, history });
    return { lastAnnounced: version, history };
}

module.exports = {
    announceIfUpdated,
    resolveChannel,
    evaluate,
    record,
    readState,
    buildAnnouncement,
    parseChangelog,
    compareSemver,
    formatUptime,
};
