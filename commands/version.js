/**
 * /version — what the bot is running, and when it last came online.
 *
 * Pairs with lib/version.js: the update announcement tells the server a new
 * version went live, this lets anyone check the current one at any time (and
 * confirms the deploy actually landed, which the announcement alone cannot do
 * after a restart loop).
 */
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../lib/config');
const version = require('../lib/version');
const music = require('../lib/music');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('version')
        .setDescription('Show the running bot version, uptime and what changed')
        .setDMPermission(false),

    category: 'Utility',

    async execute(interaction) {
        const changelog = version.parseChangelog();
        const entry = changelog.find((c) => c.version === config.version) || changelog[0];
        const uptimeMs = Date.now() - config.startedAt;

        const embed = new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle('ℹ️ Bot version')
            .setDescription(
                `**${interaction.client.user?.username || 'The Syndicate'}** `
                + `is running **v${config.version}**${config.commit ? ` (build \`${config.commit}\`)` : ''}.`,
            )
            .addFields(
                { name: 'Uptime this session', value: version.formatUptime(uptimeMs), inline: true },
                {
                    name: 'Online since',
                    value: `<t:${Math.floor(config.startedAt / 1000)}:F>`,
                    inline: true,
                },
                { name: 'Commands', value: `${interaction.client.commands?.size ?? '?'}`, inline: true },
                {
                    name: 'Music',
                    value: config.music.enabled ? '✅ enabled' : '❌ disabled',
                    inline: true,
                },
                {
                    name: 'Update announcements',
                    value: config.announce.enabled
                        ? `✅ on${config.announce.pingEveryone ? ' (@everyone)' : ''} → <#${config.announce.channelId}>`
                        : '❌ off',
                    inline: true,
                },
            )
            .setFooter({ text: 'Bump the version in package.json and restart to announce an update' })
            .setTimestamp();

        if (entry?.items?.length) {
            embed.addFields({
                name: `What changed in v${entry.version}`,
                value: entry.items
                    .slice(0, config.announce.maxChangelogItems)
                    .map((i) => `• ${i.slice(0, 180)}`)
                    .join('\n')
                    .slice(0, 1024),
                inline: false,
            });
        }

        // Voice-stack health, because the native deps are the usual failure point.
        if (config.music.enabled) {
            const ready = music.voiceReady();
            embed.addFields({
                name: 'Voice stack',
                value: ready.ok
                    ? '✅ opus + encryption + ffmpeg all present'
                    : `⚠️ missing: ${[!ready.hasOpus && 'opus', !ready.hasCrypto && 'encryption', !ready.hasFfmpeg && 'ffmpeg'].filter(Boolean).join(', ')}`,
                inline: false,
            });
        }

        return interaction.reply({ embeds: [embed], ephemeral: true });
    },
};
