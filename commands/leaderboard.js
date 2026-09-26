const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = './coins.json';

function getCoinsData() {
    if (!fs.existsSync(path)) return {};
    return JSON.parse(fs.readFileSync(path, 'utf8'));
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('Shows the richest members with the most coins'),

    async execute(interaction) {
        const coinsData = getCoinsData();
        
        // Convert object to an array of [userId, coins] and sort them highest to lowest
        const sortedUsers = Object.entries(coinsData)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10); // Top 10 members

        if (sortedUsers.length === 0) {
            return await interaction.reply({ content: 'No one has earned any coins yet!', ephemeral: true });
        }

        let description = '';
        for (let i = 0; i < sortedUsers.length; i++) {
            const [userId, coins] = sortedUsers[i];
            let medal = '🪙';
            if (i === 0) medal = '🥇';
            else if (i === 1) medal = '🥈';
            else if (i === 2) medal = '🥉';

            description += `${medal} **#${i + 1}** <@${userId}> — **${coins}** coins\n`;
        }

        const embed = new EmbedBuilder()
            .setColor('#FFD700')
            .setTitle('🏆 Server Coin Leaderboard')
            .setDescription(description)
            .setTimestamp()
            .setFooter({ text: 'Keep chatting to climb the ranks!' });

        await interaction.reply({ embeds: [embed] });
    },
};
