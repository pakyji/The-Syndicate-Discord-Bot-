const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

let antiSpamStatus = true;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('antispam')
        .setDescription('Manage the anti-spam protection settings.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addStringOption(option =>
            option.setName('status')
                .setDescription('Turn anti-spam ON or OFF')
                .setRequired(true)
                .addChoices(
                    { name: 'On', value: 'on' },
                    { name: 'Off', value: 'off' }
                )),

    async execute(interaction) {
        const status = interaction.options.getString('status');
        antiSpamStatus = (status === 'on');

        const embed = new EmbedBuilder()
            .setColor(antiSpamStatus ? 0x00FF00 : 0xFF0000)
            .setTitle('🛡️ Anti-Spam Status Updated')
            .setDescription(`Anti-spam protection has been turned **${status.toUpperCase()}**.`)
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    },
};
