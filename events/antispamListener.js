/**
 * Anti-spam / anti-flood listener.
 *
 * This file did NOT EXIST in the original repo. The only anti-spam code was the
 * root-level `antispam.js`, which was never imported by anything (dead code) and
 * — worse — called `client.login(process.env.DISCORD_TOKEN)` at module scope, so
 * if it had ever been loaded it would have opened a second gateway session on the
 * same token. `/antispam` toggled a module-level variable nothing read.
 *
 * Detection:
 *  • FLOOD  — more than `spamLimit` messages inside `spamWindowMs`.
 *  • DUPLICATE — the same message content repeated `duplicateLimit` times inside
 *    the window (copy-paste spam / advertising).
 *  • MENTION SPAM — 5+ user mentions in one message.
 *
 * Action: delete the offending message, time the member out, DM them, and log it.
 * Staff with Manage Messages bypass, and the bot never moderates itself.
 */
const { Events, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const store = require('../lib/data');
const config = require('../lib/config');
const { SlidingWindow } = require('../lib/cooldowns');

const MENTION_SPAM_THRESHOLD = 5;

/** Fixed windows keyed by guild so different servers can have different rules. */
const windows = new Map();

function getWindow(guildId, windowMs) {
    let win = windows.get(guildId);
    if (!win || win.windowMs !== windowMs) {
        win = new SlidingWindow(windowMs, 5000);
        windows.set(guildId, win);
    }
    return win;
}

/** Per-user duplicate-content tracker: userId -> { text, count, at } */
const duplicates = new Map();

function duplicateCount(userId, content, windowMs) {
    const now = Date.now();
    const entry = duplicates.get(userId);
    if (!entry || now - entry.at > windowMs || entry.text !== content) {
        duplicates.set(userId, { text: content, count: 1, at: now });
        return 1;
    }
    entry.count += 1;
    entry.at = now;
    return entry.count;
}

/** Evict stale duplicate entries so the map cannot grow forever. */
function pruneDuplicates(windowMs) {
    if (duplicates.size < 2000) return;
    const cutoff = Date.now() - windowMs;
    for (const [id, entry] of duplicates) {
        if (entry.at < cutoff) duplicates.delete(id);
    }
}

async function punish(message, settings, reason) {
    const member = message.member;
    if (!member || !member.moderatable) return false;

    const timeoutMs = settings.spamTimeoutMs ?? config.moderation.spamTimeoutMs;

    try {
        await message.delete().catch(() => {});
    } catch { /* missing Manage Messages */ }

    try {
        await member.timeout(timeoutMs, `Anti-spam: ${reason}`);
    } catch (error) {
        console.error('[antispam] timeout failed:', error.message);
        return false;
    }

    const dmEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle('⚠️ Anti-Spam Warning')
        .setDescription(
            `You were timed out for **${Math.round(timeoutMs / 1000)} seconds** in **${message.guild.name}**.\n\n`
            + `**Reason:** ${reason}\n\n*Please follow the server rules.*`,
        )
        .setTimestamp();
    await message.author.send({ embeds: [dmEmbed] }).catch(() => {});

    const notice = await message.channel
        .send(`⚠️ ${message.author} was timed out — ${reason}.`)
        .catch(() => null);
    if (notice) {
        const timer = setTimeout(() => notice.delete().catch(() => {}), 6000);
        timer.unref?.();
    }

    return true;
}

module.exports = {
    name: Events.MessageCreate,

    async execute(message) {
        if (message.author.bot || !message.guild) return;
        if (message.system) return;

        const settings = store.getGuild(message.guild.id);
        if (!settings.antiSpam) return;

        // Staff bypass.
        if (message.member && message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return;

        const windowMs = settings.spamWindowMs ?? config.moderation.spamWindowMs;
        const limit = settings.spamLimit ?? config.moderation.spamLimit;

        const win = getWindow(message.guild.id, windowMs);
        const hits = win.hit(message.author.id);

        /* 1. Flood */
        if (hits > limit) {
            win.reset(message.author.id);
            await punish(message, settings, `message flooding (${hits} messages in ${Math.round(windowMs / 1000)}s)`);
            return;
        }

        const content = (message.content || '').trim();
        if (!content) return;

        /* 2. Duplicate / copy-paste spam */
        pruneDuplicates(windowMs);
        const dupes = duplicateCount(message.author.id, content.toLowerCase(), windowMs);
        if (dupes >= config.moderation.duplicateLimit) {
            duplicates.delete(message.author.id);
            win.reset(message.author.id);
            await punish(message, settings, `sending the same message ${dupes} times`);
            return;
        }

        /* 3. Mention spam */
        const mentions = (message.mentions.users?.size || 0) + (message.mentions.roles?.size || 0);
        if (mentions >= MENTION_SPAM_THRESHOLD) {
            await punish(message, settings, `mass-mentioning ${mentions} members/roles`);
        }
    },
};
