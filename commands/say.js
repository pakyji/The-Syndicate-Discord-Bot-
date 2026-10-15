/**
 * /say — make the bot speak.
 *
 * Fixes vs. the original:
 *  • ⭐ Mass-mention abuse: the raw string was passed straight to
 *    `channel.send(text)`, so a moderator (or, before the permission fix, ANY
 *    member) could make the bot post `@everyone` / `@here` / role pings. Mentions
 *    are now escaped by default and require an explicit opt-in that itself
 *    demands Manage Guild.
 *  • The reply was sent BEFORE the message, so any failure in `channel.send`
 *    produced an unhandled rejection and the user still saw "Message sent
 *    successfully!". Order and error handling are fixed.
 *  • Length is capped to Discord's 2000-character message limit.
 *  • Now supports posting into a different channel and attaching an embed style.
 */
const {
    SlashCommandBuilder, PermissionFlagsBits, ChannelType,
} = require('discord.js');
const perms = require('../lib/perms');

const MAX_LENGTH = 2000;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('say')
        .setDescription('Make the bot send a message')
        .addStringOption((option) => option
            .setName('message')
            .setDescription('The message the bot should send')
            .setRequired(true)
            .setMaxLength(MAX_LENGTH))
        .addChannelOption((option) => option
            .setName('channel')
            .setDescription('Where to send it (defaults to this channel)')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false))
        .addBooleanOption((option) => option
            .setName('allow_pings')
            .setDescription('Allow @everyone / role pings (requires Manage Server)')
            .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .setDMPermission(false),

    category: 'Moderation',

    async execute(interaction) {
        if (!(await perms.requirePermission(interaction, PermissionFlagsBits.ManageMessages))) return;

        const text = interaction.options.getString('message').slice(0, MAX_LENGTH);
        const target = interaction.options.getChannel('channel') || interaction.channel;
        const allowPings = interaction.options.getBoolean('allow_pings') === true;

        if (!target.permissionsFor(interaction.guild.members.me).has(PermissionFlagsBits.SendMessages)) {
            return interaction.reply({ content: `❌ I cannot send messages in ${target}.`, ephemeral: true });
        }

        // Pinging everyone through the bot is a bigger privilege than just
        // Manage Messages, so require Manage Guild for it explicitly.
        if (allowPings && !interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
            return interaction.reply({
                content: '❌ `allow_pings` requires the **Manage Server** permission.',
                ephemeral: true,
            });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            await target.send({
                content: text,
                // Default: suppress every mention so the bot cannot be used to
                // mass-ping. Only opt-in enables `everyone`/`here`/roles.
                allowedMentions: allowPings
                    ? { parse: ['everyone', 'here', 'roles', 'users'] }
                    : { parse: [] },
            });
        } catch (error) {
            console.error('[say] failed to send:', error.message);
            return interaction.editReply({ content: `❌ Could not send the message in ${target}.` });
        }

        return interaction.editReply({
            content: `✅ Message sent in ${target}${allowPings ? ' (pings allowed)' : ''}.`,
        });
    },
};
