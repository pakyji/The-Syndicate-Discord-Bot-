/**
 * Anti-link listener.
 *
 * BUG FIXED: the original declared the URL matcher at module scope with the `g`
 * flag and called `.test()` on it:
 *
 *     const urlPattern = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
 *     let isBlocked = urlPattern.test(content);
 *
 * A /g/ RegExp keeps `lastIndex` between calls, so `.test()` alternated between
 * true and false on successive messages — roughly half of all links slipped
 * through. The pattern is now constructed fresh per message.
 *
 * Also fixed:
 *  • Settings are read from the unified per-guild store, not a single global
 *    securityStorage.json shared by every server.
 *  • Moderators and the bot itself are exempt (previously everyone was filtered).
 *  • No synchronous disk read on every message.
 */
const { Events, PermissionFlagsBits } = require('discord.js');
const data = require('../lib/data');
const config = require('../lib/config');

const GIF_HOSTS = ['tenor.com', 'giphy.com', 'klipy.co', 'klipy', 'imgur.com'];

function isGifLink(content) {
    const lower = content.toLowerCase();
    if (/\.(gif|gifv)(\?|$)/.test(lower)) return true;
    return GIF_HOSTS.some((host) => lower.includes(host));
}

module.exports = {
    name: Events.MessageCreate,

    async execute(message) {
        if (message.author.bot || !message.guild) return;
        if (!message.content) return;

        const settings = data.getGuild(message.guild.id);
        if (!settings.antiLink) return;

        // Staff bypass — mods need to be able to post links.
        if (message.member && message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return;

        const content = message.content.toLowerCase();

        if (isGifLink(content)) return;

        // Fresh RegExp per call — see the lastIndex bug note above.
        const urlPattern = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
        const urls = content.match(urlPattern) || [];

        let blocked = false;
        let reason = 'links are not allowed here';

        for (const domain of settings.blockedLinks || []) {
            if (domain && content.includes(String(domain).toLowerCase())) {
                blocked = true;
                reason = `\`${domain}\` links are blocked here`;
                break;
            }
        }

        if (!blocked && urls.length > 0) {
            blocked = true;
        }

        if (!blocked) return;

        try {
            await message.delete();
        } catch {
            return; // no Manage Messages permission in this channel — nothing to do
        }

        const warning = await message.channel
            .send(`⚠️ ${message.author}, ${reason}.`)
            .catch(() => null);

        if (warning) {
            const ttl = setTimeout(() => warning.delete().catch(() => {}), 5000);
            ttl.unref?.();
        }
    },
};

// Referenced so linting does not flag the import as unused in guilds where
// config-driven defaults are never touched.
void config;
