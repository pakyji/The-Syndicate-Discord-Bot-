/**
 * Bad-words filter.
 *
 * Fixes vs. the original:
 *  • Reads per-guild settings from the unified store instead of one global
 *    securityStorage.json.
 *  • Staff bypass.
 *  • Word-boundary matching for short words, so a 3-letter blocked word no
 *    longer censors every message that happens to contain those letters.
 *  • Warning messages are tracked and cleaned up on shutdown instead of
 *    leaking a setTimeout per deletion.
 *  • Placeholder entries shipped in the repo ("badword1", "badword2") are
 *    ignored so a fresh install does not censor nonsense.
 */
const { Events, PermissionFlagsBits } = require('discord.js');
const data = require('../lib/data');

const PLACEHOLDER = /^badword\d*$/i;
const pendingTimers = new Set();

function scheduleCleanup(messageRef, ms = 5000) {
    const timer = setTimeout(() => {
        pendingTimers.delete(timer);
        messageRef.delete().catch(() => {});
    }, ms);
    pendingTimers.add(timer);
    timer.unref?.();
    return timer;
}

function matches(content, word) {
    if (!word || word.length < 2) return false;
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Words of 4+ letters match anywhere (catches plurals/inflections);
    // shorter words require a boundary to avoid false positives like "ass" in "class".
    const pattern = word.length >= 4
        ? new RegExp(escaped, 'i')
        : new RegExp(`\\b${escaped}\\b`, 'i');
    return pattern.test(content);
}

module.exports = {
    name: Events.MessageCreate,

    async execute(message) {
        if (message.author.bot || !message.guild) return;
        if (!message.content) return;

        const settings = data.getGuild(message.guild.id);
        if (!settings.antiBadWords) return;
        if (message.member && message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return;

        const words = (settings.badWords || []).filter((w) => w && !PLACEHOLDER.test(w));
        if (!words.length) return;

        const content = message.content.toLowerCase();
        const hit = words.find((word) => matches(content, String(word).toLowerCase()));
        if (!hit) return;

        try {
            await message.delete();
        } catch {
            return;
        }

        const warning = await message.channel
            .send(`⚠️ ${message.author}, that language is not allowed here.`)
            .catch(() => null);

        if (warning) scheduleCleanup(warning);
    },
};

process.on('exit', () => {
    for (const timer of pendingTimers) clearTimeout(timer);
});
