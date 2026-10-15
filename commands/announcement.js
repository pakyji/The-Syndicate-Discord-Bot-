/**
 * /announcement — post a server announcement.
 *
 * Fixes vs. the original:
 *  • ⭐ MASS-PING BUG: `allowedMentions: { parse: ['everyone'] }` was set
 *    UNCONDITIONALLY, so even when the admin chose "None (No Ping)" any
 *    `@everyone` typed inside the message body still pinged the entire server.
 *    `allowedMentions` is now derived from the chosen ping option, and the body
 *    is mention-escaped when no ping was requested.
 *  • Before the permission fix this command was reachable by EVERY member
 *    (index.js dropped `default_member_permissions`), which made it a
 *    one-command server-wide ping / raid tool. It is now gated at registration
 *    AND at runtime.
 *  • Title/message lengths were uncapped — Discord rejects embed titles over 256
 *    and descriptions over 4096 characters, which surfaced as a raw API error.
 *  • No SendMessages permission check on the target channel.
 *  • Raw `error.message` was echoed to the user (info leak).
 *  • The reply happened after the send with no error path, so a failed send left
 *    the interaction hanging until Discord's "application did not respond".
 */
const {
    SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType,
} = require('discord.js');
const perms = require('../lib/perms');

const MAX_TITLE = 256;
const MAX_BODY = 4000;

/** Neutralise raw mention syntax so it cannot ping when pings are off. */
function escapeMentions(text) {
    return String(text).replace(/^@/gm, '@\u200b');
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('announcement')
        .setDescription('Send an announcement to a channel')
        .addStringOption((option) => option
            .setName('title')
            .setDescription('Announcement title')
            .setRequired(true)
            .setMaxLength(MAX_TITLE))
        .addStringOption((option) => option
            .setName('message')
            .setDescription('Announcement body')
            .setRequired(true)
            .setMaxLength(MAX_BODY))
        .addChannelOption((option) => option
            .setName('channel')
            .setDescription('Where to post it (defaults to this channel)')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false))
        .addStringOption((option) => option
            .setName('ping')
            .setDescription('Who to ping')
            .setRequired(false)
            .addChoices(
                { name: '@everyone', value: '@everyone' },
                { name: '@here', value: '@here' },
                { name: 'None (no ping)', value: 'none' },
            ))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false),

    category: 'Utility',

    async execute(interaction) {
        if (!(await perms.requirePermission(interaction, PermissionFlagsBits.Administrator))) return;

        const targetChannel = interaction.options.getChannel('channel') || interaction.channel;
        const title = interaction.options.getString('title').slice(0, MAX_TITLE);
        const rawMessage = interaction.options.getString('message').slice(0, MAX_BODY);
        const pingOption = interaction.options.getString('ping') || 'none';

        if (!targetChannel.isTextBased()) {
            return interaction.reply({ content: '❌ That is not a text channel.', ephemeral: true });
        }

        const me = interaction.guild.members.me;
        const channelPerms = targetChannel.permissionsFor(me);
        if (!channelPerms || !channelPerms.has(PermissionFlagsBits.SendMessages)) {
            return interaction.reply({ content: `❌ I cannot send messages in ${targetChannel}.`, ephemeral: true });
        }

        // Pinging @everyone is only meaningful if the bot itself may do it.
        const wantsPing = pingOption !== 'none';
        if (wantsPing && !channelPerms.has(PermissionFlagsBits.MentionEveryone)) {
            return interaction.reply({
                content: `❌ I do not have **Mention Everyone** in ${targetChannel}, so the ping would silently fail. Choose "None" or grant the permission.`,
                ephemeral: true,
            });
        }

        const message = wantsPing ? rawMessage : escapeMentions(rawMessage);

        const embed = new EmbedBuilder()
            .setColor(0xff4500)
            .setTitle(`📢 ${title}`)
            .setDescription(message)
            .setFooter({
                text: `Announcement by ${interaction.user.username}`,
                iconURL: interaction.user.displayAvatarURL({ extension: 'png', size: 64 }),
            })
            .setTimestamp();

        await interaction.deferReply({ ephemeral: true });

        try {
            await targetChannel.send({
                content: wantsPing ? pingOption : undefined,
                embeds: [embed],
                // ⭐ Derived from the choice — never unconditional.
                allowedMentions: wantsPing ? { parse: [pingOption.replace('@', '')] } : { parse: [] },
            });
        } catch (error) {
            console.error('[announcement] send failed:', error.message);
            return interaction.editReply({ content: `❌ Could not post the announcement in ${targetChannel}.` });
        }

        return interaction.editReply({
            content: `✅ Announcement posted in ${targetChannel}${wantsPing ? ` with a ${pingOption} ping` : ''}.`,
        });
    },
};
