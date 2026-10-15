/**
 * Auto-translation channel.
 *
 * Fixes vs. the original:
 *  • The axios call now has a TIMEOUT. Without one, a hung MyMemory request kept
 *    a socket open forever and queued up behind it.
 *  • `response.data.responseData.translatedText` was read with no null-guard —
 *    MyMemory returns `{ responseStatus: 403, responseData: null }` once the
 *    anonymous daily quota is exceeded, which threw a TypeError on every message.
 *  • The author's original message is NO LONGER DELETED by default. Deleting it
 *    destroyed edit history, replies and reactions, and surprised users. Set
 *    TRANSLATION_DELETE_ORIGINAL=true to restore the old behaviour.
 *  • Long messages are skipped instead of being silently truncated by the API.
 *  • Messages are rate-limited per user so one person cannot burn the daily quota.
 *  • Channel ID comes from config, not a hardcoded constant.
 *  • Members are told their text leaves the server (privacy notice on first use).
 */
const { Events, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const config = require('../lib/config');
const { Cooldowns } = require('../lib/cooldowns');
const { redact } = require('../lib/logger');

const MYMEMORY_URL = 'https://api.mymemory.translated.net/get';

/** One request per 5s per user — keeps us under MyMemory's anonymous quota. */
const rateLimit = new Cooldowns(5000, 5000);

/** Users who have already seen the privacy notice, so we only show it once. */
const noticed = new Set();

async function translate(text, targetLang) {
    const response = await axios.get(MYMEMORY_URL, {
        params: { q: text, langpair: `autodetect|${targetLang}` },
        timeout: config.translation.requestTimeoutMs,
        // MyMemory is fine with a plain UA; setting one avoids 403s from some CDNs.
        headers: { 'User-Agent': 'TheSyndicateBot/2.0 (discord.js)' },
        validateStatus: () => true,
    });

    const body = response.data;

    // MyMemory signals quota/abuse limits through responseStatus or responseDetails.
    if (!body || body.responseStatus !== 200) {
        const detail = body && body.responseDetails ? String(body.responseDetails) : 'unknown error';
        return { ok: false, error: detail };
    }

    const translated = body.responseData && body.responseData.translatedText;
    if (!translated || typeof translated !== 'string') {
        return { ok: false, error: 'empty translation' };
    }

    return { ok: true, text: translated };
}

module.exports = {
    name: Events.MessageCreate,

    async execute(message) {
        if (message.author.bot || !message.guild) return;
        if (!config.translation.enabled) return;
        if (message.channel.id !== config.channels.translation) return;
        if (!message.content || !message.content.trim()) return;

        if (message.content.length > config.translation.maxTextLength) {
            await message.channel
                .send(`ℹ️ ${message.author}, messages over ${config.translation.maxTextLength} characters are not translated.`)
                .catch(() => {});
            return;
        }

        if (!rateLimit.take(message.author.id)) return;

        // One-time privacy notice: text is sent to a third-party API.
        if (!noticed.has(message.author.id)) {
            noticed.add(message.author.id);
            const notice = new EmbedBuilder()
                .setColor(0x5865f2)
                .setTitle('🔎 Translation notice')
                .setDescription(
                    `Messages in this channel are sent to **MyMemory** (api.mymemory.translated.net) `
                    + `to be translated into ${config.translation.targetLang.toUpperCase()}. `
                    + `Do not post personal or sensitive information here.`,
                );
            await message.channel.send({ embeds: [notice] }).catch(() => {});
        }

        let result;
        try {
            result = await translate(message.content, config.translation.targetLang);
        } catch (error) {
            console.error('[translation] request failed:', redact(error.message));
            return;
        }

        if (!result.ok) {
            console.warn(`[translation] MyMemory refused the request: ${result.error}`);
            return;
        }

        // Nothing to do if the text came back unchanged (already in the target language).
        if (result.text.toLowerCase() === message.content.toLowerCase()) return;

        await message.channel
            .send(`💬 **${message.author.username}:** ${result.text}`)
            .catch((error) => console.error('[translation] could not post:', error.message));

        if (config.translation.deleteOriginal) {
            await message.delete().catch(() => {});
        }
    },
};
