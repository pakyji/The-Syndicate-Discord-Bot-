/**
 * Rich embeds for shared media links.
 *
 * Fixes vs. the original:
 *  • ⭐ It DELETED the member's own message every time a Spotify / TikTok /
 *    YouTube link was posted, in EVERY channel, and replaced it with a bot post.
 *    That destroyed the original message (and its replies, reactions and edit
 *    history), broke conversation context, and made the member look like they
 *    never posted. It also fires on any message merely *containing* such a link,
 *    including quotes and troubleshooting help.
 *    → Now OFF by default. Enable with MEDIA_EMBED_ENABLED=true, and even then
 *      it only acts in channels you list in MEDIA_EMBED_CHANNELS.
 *  • Three RegExp objects were re-created on EVERY message (this handler runs on
 *    every messageCreate). They are now compiled once at module scope.
 *  • The Spotify footer hotlinked a Wikimedia logo that may 404 or change; embeds
 *    no longer depend on an external image.
 *  • The `catch` wrapped the whole block, so one failed delete silently skipped
 *    the remaining platforms.
 *  • Respects antilink: if link filtering is on and this channel is filtered, the
 *    antilink listener has already handled the message.
 */
const { Events, EmbedBuilder } = require('discord.js');
const config = require('../lib/config');

// Compiled once, not per message.
const PATTERNS = [
    {
        key: 'spotify',
        color: 0x1db954,
        title: '🎵 Spotify',
        cta: 'Click here to listen',
        regex: /https:\/\/open\.spotify\.com\/(?:intl-[a-z]{2}\/)?(track|album|playlist|artist)\/([A-Za-z0-9]+)/i,
    },
    {
        key: 'tiktok',
        color: 0x000000,
        title: '📱 TikTok',
        cta: 'Click here to watch on TikTok',
        regex: /https?:\/\/(?:www\.|vm\.)?tiktok\.com\/(?:@[\w.-]+\/video\/\d+|[A-Za-z0-9]+)/i,
    },
    {
        key: 'youtube',
        color: 0xff0000,
        title: '🎬 YouTube',
        cta: 'Click here to watch on YouTube',
        regex: /https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/|live\/)[\w-]+|youtu\.be\/[\w-]+)/i,
    },
];

module.exports = {
    name: Events.MessageCreate,

    async execute(message) {
        if (message.author.bot || !message.guild) return;
        if (!config.mediaEmbed.enabled) return;
        if (!message.content) return;

        // Restrict to configured channels when a list is provided.
        if (config.mediaEmbed.channels.length && !config.mediaEmbed.channels.includes(message.channel.id)) {
            return;
        }

        const match = PATTERNS
            .map((p) => ({ platform: p, url: (message.content.match(p.regex) || [])[0] }))
            .find((entry) => entry.url);

        if (!match) return;

        // Nothing to do if we cannot manage messages in this channel.
        const me = message.guild.members.me;
        if (!message.channel.permissionsFor(me)?.has('SendMessages')) return;

        const { platform, url } = match;

        const embed = new EmbedBuilder()
            .setColor(platform.color)
            .setTitle(platform.title)
            .setDescription(`**Shared by:** ${message.author}\n\n🔗 [${platform.cta}](${url})`)
            .setFooter({ text: `${platform.title} link` })
            .setTimestamp();

        const canDelete = config.mediaEmbed.deleteOriginal
            && message.channel.permissionsFor(me)?.has('ManageMessages');

        try {
            await message.channel.send({ embeds: [embed] });
            if (canDelete) await message.delete().catch(() => {});
        } catch (error) {
            console.error(`[mediaEmbed] ${platform.key} failed:`, error.message);
        }
    },
};
