const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('id')
        .setDescription('Kisi bhi channel ya role ki ID dekhein')
        .addSubcommand(subcommand =>
            subcommand
                .setName('channel')
                .setDescription('Kisi channel ki ID nikalein')
                .addChannelOption(option =>
                    option.setName('target_channel')
                        .setDescription('Channel select karein')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('role')
                .setDescription('Kisi role ki ID nikalein')
                .addRoleOption(option =>
                    option.setName('target_role')
                        .setDescription('Role select karein')
                        .setRequired(true)))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    async execute(interaction) {
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
    },
};
