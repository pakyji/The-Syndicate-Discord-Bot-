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

// Function to automatically add random coins to the winner's balance
function addJackpotCoins(userId, amount) {
    const coinsData = getCoinsData();
    if (!coinsData[userId]) {
        coinsData[userId] = 0;
    }
    coinsData[userId] += amount;
    saveCoinsData(coinsData);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('jackpot')
        .setDescription('Launch a jackpot with a random prize pool generated within a specified range')
        .addIntegerOption(option =>
            option.setName('min_coins')
                .setDescription('Minimum random coins for the prize pool')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('max_coins')
                .setDescription('Maximum random coins for the prize pool')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('duration')
                .setDescription('Duration of the jackpot in minutes')
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

            // Calculate a random prize pool within the specified min and max range
            const randomPrize = Math.floor(Math.random() * (maxCoins - minCoins + 1)) + minCoins;

            const durationMs = durationMinutes * 60 * 1000;
            const endsAt = Date.now() + durationMs;

            const embed = new EmbedBuilder()
                .setColor(0xFFD700)
                .setTitle('🎰 THE SYNDICATE • AUTOMATED JACKPOT 🎰')
                .setDescription(`A new random jackpot has been launched by the bot!\n\n` +
                    `🎁 **Prize Pool:** ${randomPrize.toLocaleString()} Coins *(Randomly Generated)*\n` +
                    `🤖 **Hosted By:** The Syndicate Bot\n` +
                    `⏳ **Ends:** <t:${Math.floor(endsAt / 1000)}:R>\n\n` +
                    `👉 *Click the button below to join the jackpot!*`)
                .setFooter({ text: 'Current Participants: 0' })
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('join_jackpot')
                    .setLabel('Join Jackpot')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('🎟️')
            );

            await interaction.reply({ content: '✅ Random jackpot launched successfully!', ephemeral: true });
            const jackpotMessage = await interaction.channel.send({ embeds: [embed], components: [row] });

            const entrants = new Set();
            const collector = jackpotMessage.createMessageComponentCollector({ time: durationMs });

            collector.on('collect', async i => {
                if (i.customId === 'join_jackpot') {
                    if (entrants.has(i.user.id)) {
                        return i.reply({ content: '⚠️ You are already entered into this jackpot!', ephemeral: true });
                    }

                    entrants.add(i.user.id);

                    const updatedEmbed = EmbedBuilder.from(embed)
                        .setFooter({ text: `Current Participants: ${entrants.size}` });
                    
                    await jackpotMessage.edit({ embeds: [updatedEmbed] }).catch(() => {});
                    await i.reply({ content: '🎉 You have successfully joined the jackpot!', ephemeral: true });
                }
            });

            collector.on('end', async () => {
                const entrantsArray = Array.from(entrants);
                
                const disabledRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('join_jackpot')
                        .setLabel('Jackpot Ended')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true)
                        .setEmoji('🔒')
                );

                if (entrantsArray.length === 0) {
                    const endedEmbed = EmbedBuilder.from(embed)
                        .setColor(0x808080)
                        .setDescription(`🎁 **Prize Pool:** ${randomPrize.toLocaleString()} Coins\n\n❌ **Jackpot Ended:** No users participated in time.`);
                    
                    return await jackpotMessage.edit({ embeds: [endedEmbed], components: [disabledRow] }).catch(() => {});
                }

                // Randomly select a winner from the entrants list
                const winnerId = entrantsArray[Math.floor(Math.random() * entrantsArray.length)];

                // Automatically credit the generated prize pool to the winner's account in coins.json
                addJackpotCoins(winnerId, randomPrize);

                const winnerEmbed = EmbedBuilder.from(embed)
                    .setColor(0x00FF00)
                    .setDescription(`🎁 **Prize Pool:** ${randomPrize.toLocaleString()} Coins\n\n🏆 **Winner Drawn:** <@${winnerId}>\n🎉 Congratulations! The bot has automatically added **${randomPrize.toLocaleString()} coins** to your balance!`);

                await jackpotMessage.edit({ embeds: [winnerEmbed], components: [disabledRow] }).catch(() => {});
                await interaction.channel.send(`🎊 Congratulations <@${winnerId}>! You won **${randomPrize.toLocaleString()} coins** from the random jackpot, added automatically by the bot!`).catch(() => {});
            });

        } catch (error) {
            console.error('Error in random jackpot command:', error);
            if (!interaction.replied && !interaction.deferred) {
                return interaction.reply({ content: '❌ An error occurred while executing the jackpot command.', ephemeral: true });
            }
        }
    },
};
