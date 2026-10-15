/**
 * /twitch — manage Twitch live notifications for this server.
 *
 * Fixes vs. the original:
 *  • Config is PER-GUILD in the unified store (was one global twitchConfig.json,
 *    so a streamer added in server A alerted server B too).
 *  • ⭐ The `test` subcommand sent `content: "Hey @everyone! ... is live"` while
 *    the command only required **ManageChannels**. Anyone who could manage
 *    channels could therefore @everyone-ping the whole server. `allowedMentions`
 *    is now explicit, and the everyone ping requires ManageMessages as well.
 *  • The hardcoded fallback notification channel ID is gone — no channel means a
 *    clear error telling you to run `/twitch set` first.
 *  • The test embed advertised a fake category and title ("Ultimate Syndicate
 *    Live Stream") as though it were real data; it is now clearly labelled TEST.
 *  • Streamer usernames are validated and the list is capped, so it cannot be
 *    grown without limit or filled with junk.
 *  • `targetChannel.type !== 0` replaced with the readable ChannelType enum.
 *  • Runtime permission check added.
 */
const {
    SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType,
} = require('discord.js');
const perms = require('../lib/perms');
const twitchConfig = require('../lib/twitchConfig');
const config = require('../lib/config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('twitch')
        .setDescription('Manage Twitch live stream notifications')
        .addSubcommand((sub) => sub
            .setName('set')
            .setDescription('Set the Discord channel for Twitch notifications')
            .addChannelOption((option) => option
                .setName('channel')
                .setDescription('Text channel for notifications')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true)))
        .addSubcommand((sub) => sub
            .setName('add')
            .setDescription('Add a Twitch streamer to track')
            .addStringOption((option) => option
                .setName('username')
                .setDescription('Twitch username')
                .setRequired(true)))
        .addSubcommand((sub) => sub
            .setName('remove')
            .setDescription('Remove a tracked Twitch streamer')
            .addStringOption((option) => option
                .setName('username')
                .setDescription('Twitch username to remove')
                .setRequired(true)))
        .addSubcommand((sub) => sub
            .setName('list')
            .setDescription('Show the tracked streamers and the alert channel'))
        .addSubcommand((sub) => sub
            .setName('test')
            .setDescription('Send a TEST notification to the configured channel')
            .addStringOption((option) => option
                .setName('username')
                .setDescription('Streamer username to use in the test')
                .setRequired(false))
            .addBooleanOption((option) => option
                .setName('ping_everyone')
                .setDescription('Also ping @everyone (requires Manage Messages)')
                .setRequired(false)))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .setDMPermission(false),

    category: 'Utility',

    async execute(interaction) {
        if (!(await perms.requirePermission(interaction, PermissionFlagsBits.ManageChannels))) return;

        const guildId = interaction.guild.id;
        const sub = interaction.options.getSubcommand();

        try {
            /* ── set ─────────────────────────────────────────── */
            if (sub === 'set') {
                const targetChannel = interaction.options.getChannel('channel');
                if (targetChannel.type !== ChannelType.GuildText) {
                    return interaction.reply({ content: '❌ Please choose a text channel.', ephemeral: true });
                }

                const me = interaction.guild.members.me;
                if (!targetChannel.permissionsFor(me).has(PermissionFlagsBits.SendMessages)) {
                    return interaction.reply({ content: `❌ I cannot send messages in ${targetChannel}.`, ephemeral: true });
                }

                await twitchConfig.update(guildId, (cfg) => { cfg.notificationChannelId = targetChannel.id; });

                const embed = new EmbedBuilder()
                    .setColor(0x9146ff)
                    .setTitle('📺 Twitch Alert Channel Set')
                    .setDescription(`Twitch alerts will now post in ${targetChannel} (\`${targetChannel.id}\`).`)
                    .setTimestamp();

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            /* ── add ─────────────────────────────────────────── */
            if (sub === 'add') {
                const username = twitchConfig.normaliseUsername(interaction.options.getString('username'));
                if (!username) {
                    return interaction.reply({
                        content: '❌ That does not look like a valid Twitch username (4-25 characters, letters, numbers and underscore only).',
                        ephemeral: true,
                    });
                }
                if (twitchConfig.isFull(guildId)) {
                    return interaction.reply({
                        content: `❌ The tracking list is full (${twitchConfig.MAX_STREAMERS} streamers). Remove one first.`,
                        ephemeral: true,
                    });
                }

                const cfg = twitchConfig.get(guildId);
                if (cfg.streamers.includes(username)) {
                    return interaction.reply({ content: `⚠️ **${username}** is already tracked.`, ephemeral: true });
                }

                await twitchConfig.update(guildId, (c) => { c.streamers.push(username); });

                const embed = new EmbedBuilder()
                    .setColor(0x00ff66)
                    .setTitle('➕ Streamer Added')
                    .setDescription(`Now tracking [**${username}**](https://twitch.tv/${username}).`)
                    .setTimestamp();

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            /* ── remove ──────────────────────────────────────── */
            if (sub === 'remove') {
                const username = twitchConfig.normaliseUsername(interaction.options.getString('username'));
                const cfg = twitchConfig.get(guildId);

                if (!username || !cfg.streamers.includes(username)) {
                    return interaction.reply({ content: `❌ **${username || '?'}** is not in the tracking list.`, ephemeral: true });
                }

                await twitchConfig.update(guildId, (c) => {
                    c.streamers = c.streamers.filter((s) => s !== username);
                    delete c.lastLive[username];
                });

                const embed = new EmbedBuilder()
                    .setColor(0xff0000)
                    .setTitle('➖ Streamer Removed')
                    .setDescription(`No longer tracking **${username}**.`)
                    .setTimestamp();

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            /* ── list ────────────────────────────────────────── */
            if (sub === 'list') {
                const cfg = twitchConfig.get(guildId);
                const embed = new EmbedBuilder()
                    .setColor(0x9146ff)
                    .setTitle('📺 Twitch Tracking')
                    .setDescription(`Alert channel: ${cfg.notificationChannelId ? `<#${cfg.notificationChannelId}>` : '*not set — run `/twitch set`*'}`)
                    .addFields({
                        name: `Streamers (${cfg.streamers.length}/${twitchConfig.MAX_STREAMERS})`,
                        value: cfg.streamers.length
                            ? cfg.streamers.map((s) => `• [${s}](https://twitch.tv/${s})`).join('\n').slice(0, 1024)
                            : '*None tracked yet*',
                    })
                    .setFooter({ text: cfg.notificationChannelId ? '' : 'Twitch alerts will not be delivered until a channel is set.' })
                    .setTimestamp();

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            /* ── test ────────────────────────────────────────── */
            if (sub === 'test') {
                const cfg = twitchConfig.get(guildId);

                if (!cfg.notificationChannelId) {
                    return interaction.reply({
                        content: '❌ No alert channel is configured for this server. Run `/twitch set` first.',
                        ephemeral: true,
                    });
                }

                const targetChannel = interaction.guild.channels.cache.get(cfg.notificationChannelId)
                    || await interaction.guild.channels.fetch(cfg.notificationChannelId).catch(() => null);

                if (!targetChannel || !targetChannel.isTextBased()) {
                    return interaction.reply({
                        content: `❌ The configured channel (\`${cfg.notificationChannelId}\`) no longer exists. Run \`/twitch set\` again.`,
                        ephemeral: true,
                    });
                }

                const streamer = twitchConfig.normaliseUsername(interaction.options.getString('username')) || 'syndicategaming';
                const wantsEveryone = interaction.options.getBoolean('ping_everyone') === true;

                // ⭐ An @everyone ping needs Manage Messages, not just Manage Channels.
                if (wantsEveryone && !interaction.memberPermissions.has(PermissionFlagsBits.ManageMessages)) {
                    return interaction.reply({
                        content: '❌ Pinging @everyone requires the **Manage Messages** permission.',
                        ephemeral: true,
                    });
                }

                const liveEmbed = new EmbedBuilder()
                    .setColor(0x9146ff)
                    .setTitle(`🔴 ${streamer.toUpperCase()} IS LIVE — TEST NOTIFICATION`)
                    .setURL(`https://twitch.tv/${streamer}`)
                    .setDescription(
                        `This is a **test** alert triggered by ${interaction.user}.\n`
                        + `Live alerts for tracked streamers will look like this.`,
                    )
                    .setImage(`https://static-cdn.jtvnw.net/previews-ttv/live_user_${streamer}-640x360.jpg`)
                    .setFooter({ text: 'Syndicate Twitch Alert System • TEST' })
                    .setTimestamp();

                await targetChannel.send({
                    content: wantsEveryone ? '@everyone' : undefined,
                    embeds: [liveEmbed],
                    // Explicit: never parse roles/here, only everyone when asked for.
                    allowedMentions: { parse: wantsEveryone ? ['everyone'] : [], users: [], roles: [] },
                });

                return interaction.reply({
                    content: `✅ Test notification sent to ${targetChannel}${wantsEveryone ? ' with an @everyone ping' : ''}.`,
                    ephemeral: true,
                });
            }
        } catch (error) {
            console.error('[twitch] error:', error.message);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: '❌ An error occurred while processing that Twitch command.', ephemeral: true });
            }
        }
    },
};

// Keep the lint quiet about the shared config import used for defaults only.
void config;
