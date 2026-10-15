/**
 * /setupverify — post the platform verification panel.
 * Converted from the legacy `{name, execute}` format (registered with zero
 * options) to a proper slash command with a target-channel option.
 */
const {
    SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder,
    ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType,
} = require('discord.js');
const perms = require('../lib/perms');

function buildPanel() {
    const embed = new EmbedBuilder()
        .setColor('#2b2d31')
        .setTitle('The Syndicate')
        .setDescription('Welcome! Click your gaming platform below to unlock the server.')
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('verify_ps4').setLabel('PS4').setStyle(ButtonStyle.Primary).setEmoji('🎮'),
        new ButtonBuilder().setCustomId('verify_ps5').setLabel('PS5').setStyle(ButtonStyle.Primary).setEmoji('🎮'),
        new ButtonBuilder().setCustomId('verify_pc').setLabel('PC').setStyle(ButtonStyle.Success).setEmoji('💻'),
        new ButtonBuilder().setCustomId('verify_xbox').setLabel('Xbox').setStyle(ButtonStyle.Primary).setEmoji('🟢'),
        new ButtonBuilder().setCustomId('verify_nongamer').setLabel('Non-Gamer').setStyle(ButtonStyle.Secondary).setEmoji('👤'),
    );

    return { embeds: [embed], components: [row] };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setupverify')
        .setDescription('Send the verification panel with platform buttons')
        .addChannelOption((option) => option
            .setName('channel')
            .setDescription('Where to post the panel (defaults to this channel)')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false),

    category: 'Moderation',

    async execute(interaction) {
        if (!(await perms.requirePermission(interaction, PermissionFlagsBits.ManageGuild))) return;

        const target = interaction.options.getChannel('channel') || interaction.channel;

        if (!target.permissionsFor(interaction.guild.members.me).has(PermissionFlagsBits.SendMessages)) {
            return interaction.reply({ content: `❌ I cannot send messages in ${target}.`, ephemeral: true });
        }

        try {
            await target.send(buildPanel());
            return interaction.reply({ content: `✅ Verification panel posted in ${target}.`, ephemeral: true });
        } catch (error) {
            console.error('[setupverify] failed:', error.message);
            return interaction.reply({ content: '❌ Failed to send the verification panel.', ephemeral: true });
        }
    },
};
