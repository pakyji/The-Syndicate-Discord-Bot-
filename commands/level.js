const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('level')
        .setDescription('Check your current level and XP in the server'),

    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setColor('#00FF7F')
            .setTitle('📊 Level & Rank Status')
            .setDescription(`👤 **User:** <@${interaction.user.id}>\n⭐ **Status:** Active in chat & GTA LFG!`)
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    },
};
