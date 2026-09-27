const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('id')
        .setDescription('View the ID of any channel or role')
        .addSubcommand(subcommand =>
            subcommand
                .setName('channel')
                .setDescription('Get the ID of a specific channel')
                .addChannelOption(option =>
                    option.setName('target_channel')
                        .setDescription('Select the target channel')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('role')
                .setDescription('Get the ID of a specific role')
                .addRoleOption(option =>
                    option.setName('target_role')
                        .setDescription('Select the target role')
                        .setRequired(true)))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    category: 'Utility',

    async execute(interaction) {
        try {
            const subcommand = interaction.options.getSubcommand();

            if (subcommand === 'channel') {
                const channel = interaction.options.getChannel('target_channel');
                return interaction.reply({
                    content: `📁 **Channel Name:** ${channel.name}\n🆔 **Channel ID:** \`${channel.id}\``,
                    ephemeral: true
                });
            } 
            
            if (subcommand === 'role') {
                const role = interaction.options.getRole('target_role');
                return interaction.reply({
                    content: `🛡️ **Role Name:** ${role.name}\n🆔 **Role ID:** \`${role.id}\``,
                    ephemeral: true
                });
            }
        } catch (error) {
            console.error('Error in id command:', error);
            if (!interaction.replied && !interaction.deferred) {
                return interaction.reply({ content: '❌ An error occurred while retrieving the ID.', ephemeral: true });
            }
        }
    },
};
