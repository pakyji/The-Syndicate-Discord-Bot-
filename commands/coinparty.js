const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');

const coinsPath = path.join(__dirname, '../coins.json');

// Helper functions to read and write the coins database
function getCoinsData() {
    if (!fs.existsSync(coinsPath)) {
        fs.writeFileSync(coinsPath, JSON.stringify({}));
    }
    try {
        return JSON.parse(fs.readFileSync(coinsPath, 'utf8'));
    } catch (err) {
        return {};
    }
}

function saveCoinsData(data) {
    fs.writeFileSync(coinsPath, JSON.stringify(data, null, 2));
}

// Function to automatically add coinparty reward coins to the winner's balance
function addCoinpartyCoins(userId, amount) {
    const coinsData = getCoinsData();
    if (!coinsData[userId]) {
        coinsData[userId] = 0;
    }
    coinsData[userId] += amount;
    saveCoinsData(coinsData);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('coinparty')
        .setDescription('Launch an automated coin party event with a random prize pool')
        .addIntegerOption(option =>
            option.setName('min_coins')
                .setDescription('Minimum random coins for the coin party prize')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('max_coins')
                .setDescription('Maximum random coins for the coin party prize')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('duration')
                .setDescription('Duration of the coin party in minutes')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    category: 'Economy',

    async execute(interaction) {
        try {
            const minCoins = interaction.options.getInteger('min_coins');
            const maxCoins = interaction.options.getInteger('max_coins');
            const durationMinutes = interaction.options.getInteger('duration');

            if (minCoins > maxCoins) {
                return interaction.reply({ content: '❌ Minimum coins cannot be greater than maximum coins!', ephemeral: true });
            }

            // Generate a random prize pool within the specified range
            const randomPrize = Math.floor(Math.random() * (maxCoins - minCoins + 1)) + minCoins;

            const durationMs = durationMinutes * 60 * 1000;
            const endsAt = Date.now() + durationMs;

            const embed = new EmbedBuilder()
                .setColor(0xFF4500)
                .setTitle('🎉 THE SYNDICATE • COIN PARTY 🎉')
                .setDescription(`A new coin party has started!\n\n` +
                    `🎁 **Prize:** ${randomPrize.toLocaleString()} Coins *(Randomly Generated)*\n` +
                    `🤖 **Hosted By:** The Syndicate Bot\n` +
                    `⏳ **Ends:** <t:${Math.floor(endsAt / 1000)}:R>\n\n` +
                    `👉 *Click the button below to join the coin party!*`)
                .setFooter({ text: 'Current Participants: 0' })
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('join_coinparty')
                    .setLabel('Join Coin Party')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('🎉')
            );

            await interaction.reply({ content: '✅ Coin party launched successfully!', ephemeral: true });
            const partyMessage = await interaction.channel.send({ embeds: [embed], components: [row] });

            const entrants = new Set();
            const collector = partyMessage.createMessageComponentCollector({ time: durationMs });

            collector.on('collect', async i => {
                if (i.customId === 'join_coinparty') {
                    if (entrants.has(i.user.id)) {
                        return i.reply({ content: '⚠️ You are already entered into this coin party!', ephemeral: true });
                    }

                    entrants.add(i.user.id);

                    const updatedEmbed = EmbedBuilder.from(embed)
                        .setFooter({ text: `Current Participants: ${entrants.size}` });
                    
                    await partyMessage.edit({ embeds: [updatedEmbed] }).catch(() => {});
                    await i.reply({ content: '🎉 You have successfully joined the coin party!', ephemeral: true });
                }
            });

            collector.on('end', async () => {
                const entrantsArray = Array.from(entrants);
                
                const disabledRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('join_coinparty')
                        .setLabel('Coin Party Ended')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true)
                        .setEmoji('🔒')
                );

                if (entrantsArray.length === 0) {
                    const endedEmbed = EmbedBuilder.from(embed)
                        .setColor(0x808080)
                        .setDescription(`🎁 **Prize:** ${randomPrize.toLocaleString()} Coins\n\n❌ **Coin Party Ended:** No users participated in time.`);
                    
                    return await partyMessage.edit({ embeds: [endedEmbed], components: [disabledRow] }).catch(() => {});
                }

                // Randomly pick a winner
                const winnerId = entrantsArray[Math.floor(Math.random() * entrantsArray.length)];

                // Automatically credit coins to winner's coins.json account
                addCoinpartyCoins(winnerId, randomPrize);

                const winnerEmbed = EmbedBuilder.from(embed)
                    .setColor(0x00FF00)
                    .setDescription(`🎁 **Prize:** ${randomPrize.toLocaleString()} Coins\n\n🏆 **Winner:** <@${winnerId}>\n🎉 Congratulations! The bot has automatically credited **${randomPrize.toLocaleString()} coins** to your balance!`);

                await partyMessage.edit({ embeds: [winnerEmbed], components: [disabledRow] }).catch(() => {});
                await interaction.channel.send(`🎊 Congratulations <@${winnerId}>! You won the coin party and received **${randomPrize.toLocaleString()} coins** automatically!`).catch(() => {});
            });

        } catch (error) {
            console.error('Error in coinparty command:', error);
            if (!interaction.replied && !interaction.deferred) {
                return interaction.reply({ content: '❌ An error occurred while executing the coinparty command.', ephemeral: true });
            }
        }
    },
};
