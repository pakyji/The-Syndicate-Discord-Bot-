/**
 * /verify-members — post a permanent verification panel for existing members.
 * Converted to SlashCommandBuilder so `default_member_permissions` is carried on
 * the builder (the legacy raw property was never forwarded to Discord).
 */
const {
    SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder,
    ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType,
} = require('discord.js');
const perms = require('../../lib/perms');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('verify-members')
        .setDescription('Post a permanent verification panel for existing server members')
        .addChannelOption((option) => option
            .setName('channel')
            .setDescription('Where to post the panel (defaults to this channel)')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false),

    category: 'Admin',

    async execute(interaction) {
        if (!(await perms.requirePermission(interaction, PermissionFlagsBits.Administrator))) return;

        const target = interaction.options.getChannel('channel') || interaction.channel;

        const embed = new EmbedBuilder()
            .setColor('#2b2d31')
            .setTitle('The Syndicate Verification')
            .setDescription('Welcome! Click your gaming platform below to verify and unlock full access to the server.')
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('verify_ps4').setLabel('PS4').setStyle(ButtonStyle.Primary).setEmoji('🎮'),
            new ButtonBuilder().setCustomId('verify_ps5').setLabel('PS5').setStyle(ButtonStyle.Primary).setEmoji('🎮'),
            new ButtonBuilder().setCustomId('verify_pc').setLabel('PC').setStyle(ButtonStyle.Success).setEmoji('💻'),
            new ButtonBuilder().setCustomId('verify_xbox').setLabel('Xbox').setStyle(ButtonStyle.Primary).setEmoji('🟢'),
            new ButtonBuilder().setCustomId('verify_nongamer').setLabel('Non-Gamer').setStyle(ButtonStyle.Secondary).setEmoji('👤'),
        );

        try {
            await target.send({ embeds: [embed], components: [row] });
            return interaction.reply({ content: `✅ Verification panel posted in ${target}.`, ephemeral: true });
        } catch (error) {
            console.error('[verify-members] failed:', error.message);
            return interaction.reply({ content: '❌ Failed to post the panel.', ephemeral: true });
        }
    },
};
