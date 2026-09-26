const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = './coins.json';

function getCoinsData() {
    if (!fs.existsSync(path)) return {};
    return JSON.parse(fs.readFileSync(path, 'utf8'));
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('balance')
        .setDescription('Check your current coin balance')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('Check another user\'s balance')
                .setRequired(false)),

    async execute(interaction) {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const coinsData = getCoinsData();
        const userCoins = coinsData[targetUser.id] || 0;

        const embed = new EmbedBuilder()
            .setColor('#FFD700')
            .setTitle('🪙 Coin Balance')
            .setDescription(`**${targetUser.tag}** has **${userCoins}** coins! 💰`)
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    },
};
