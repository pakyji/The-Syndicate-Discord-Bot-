const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('reactionroles')
        .setDescription('Send the gaming platform reaction roles panel')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        const targetChannelId = '899366913086455828'; // Aapka target channel ID
        const channel = await interaction.guild.channels.fetch(targetChannelId).catch(() => null);

        if (!channel) {
            return interaction.reply({ content: '❌ Target reaction roles channel not found!', ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setColor('#7289DA')
            .setTitle('🎮 SYNDICATE - Platform Roles')
            .setDescription('Click the buttons below to select or remove your gaming platform roles!\n\n• **PS4** / **PS5**\n• **PC** / **PC Enhanced**\n• **Xbox Series**\n• **Switch**\n• **Mobile User**\n• **Non Gamer**')
            .setFooter({ text: 'The Syndicate Role System' })
            .setTimestamp();

        // Row 1: Console & PC
        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('role_ps4').setLabel('PS4').setStyle(ButtonStyle.Primary).setEmoji('🎮'),
            new ButtonBuilder().setCustomId('role_ps5').setLabel('PS5').setStyle(ButtonStyle.Primary).setEmoji('🎮'),
            new ButtonBuilder().setCustomId('role_pc').setLabel('PC').setStyle(ButtonStyle.Success).setEmoji('💻'),
            new ButtonBuilder().setCustomId('role_pc_enhanced').setLabel('PC Enhanced').setStyle(ButtonStyle.Success).setEmoji('⚡')
        );

        // Row 2: Xbox, Switch, Mobile, Non-Gamer
        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('role_xbox').setLabel('Xbox Series').setStyle(ButtonStyle.Secondary).setEmoji('🟩'),
            new ButtonBuilder().setCustomId('role_switch').setLabel('Switch').setStyle(ButtonStyle.Danger).setEmoji('🔴'),
            new ButtonBuilder().setCustomId('role_mobile').setLabel('Mobile').setStyle(ButtonStyle.Secondary).setEmoji('📱'),
            new ButtonBuilder().setCustomId('role_nongamer').setLabel('Non Gamer').setStyle(ButtonStyle.Secondary).setEmoji('🛑')
        );

        await channel.send({ embeds: [embed], components: [row1, row2] });
        await interaction.reply({ content: `✅ Reaction roles panel has been successfully sent to <#${targetChannelId}>!`, ephemeral: true });
    },
};
