const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('reactionroles')
        .setDescription('Automatically creates platform roles and sends the reaction role panel')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        const targetChannelId = '899366913086455828';
        const channel = await interaction.guild.channels.fetch(targetChannelId).catch(() => null);

        if (!channel) {
            return interaction.reply({ content: '❌ Target reaction roles channel not found!', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        // List of roles to check or create automatically
        const roleNames = [
            'PS4', 
            'PS5', 
            'PC', 
            'PC Enhanced', 
            'X Box Series', 
            'Switch', 
            'Mobile User', 
            'Non Gamer'
        ];

        const createdRoles = {};

        // Loop through each role name to check or create it
        for (const name of roleNames) {
            let role = interaction.guild.roles.cache.find(r => r.name.toLowerCase() === name.toLowerCase());
            
            if (!role) {
                try {
                    // Bot creates the role if it doesn't exist
                    role = await interaction.guild.roles.create({
                        name: name,
                        reason: 'Automatic creation for reaction roles panel'
                    });
                } catch (error) {
                    console.error(`Failed to create role ${name}:`, error);
                }
            }
            if (role) {
                createdRoles[name] = role.id;
            }
        }

        const embed = new EmbedBuilder()
            .setColor('#7289DA')
            .setTitle('🎮 SYNDICATE - Platform Roles')
            .setDescription('Click the buttons below to select or remove your gaming platform roles!\n\n• **PS4** / **PS5**\n• **PC** / **PC Enhanced**\n• **Xbox Series**\n• **Switch**\n• **Mobile User**\n• **Non Gamer**')
            .setFooter({ text: 'The Syndicate Role System' })
            .setTimestamp();

        // Row 1: Console & PC buttons
        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('role_ps4').setLabel('PS4').setStyle(ButtonStyle.Primary).setEmoji('🎮'),
            new ButtonBuilder().setCustomId('role_ps5').setLabel('PS5').setStyle(ButtonStyle.Primary).setEmoji('🎮'),
            new ButtonBuilder().setCustomId('role_pc').setLabel('PC').setStyle(ButtonStyle.Success).setEmoji('💻'),
            new ButtonBuilder().setCustomId('role_pc_enhanced').setLabel('PC Enhanced').setStyle(ButtonStyle.Success).setEmoji('⚡')
        );

        // Row 2: Xbox, Switch, Mobile, Non-Gamer buttons
        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('role_xbox').setLabel('Xbox Series').setStyle(ButtonStyle.Secondary).setEmoji('🟩'),
            new ButtonBuilder().setCustomId('role_switch').setLabel('Switch').setStyle(ButtonStyle.Danger).setEmoji('🔴'),
            new ButtonBuilder().setCustomId('role_mobile').setLabel('Mobile').setStyle(ButtonStyle.Secondary).setEmoji('📱'),
            new ButtonBuilder().setCustomId('role_nongamer').setLabel('Non Gamer').setStyle(ButtonStyle.Secondary).setEmoji('🛑')
        );

        await channel.send({ embeds: [embed], components: [row1, row2] });
        await interaction.editReply({ content: `✅ Reaction roles panel sent to <#${targetChannelId}> and roles have been verified/created successfully!` });
    },
};
