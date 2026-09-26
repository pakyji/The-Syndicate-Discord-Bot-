const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Path to your economy file (agar aap JSON file use kar rahe hain)
const economyPath = path.join(__dirname, '../economy.json'); // Apne path ke mutabiq adjust kar sakte hain

// Helper function to get/update balances
function addCoins(userId, amount) {
    let data = {};
    if (fs.existsSync(economyPath)) {
        try {
            data = JSON.parse(fs.readFileSync(economyPath, 'utf8'));
        } catch (err) {
            data = {};
        }
    }
    
    if (!data[userId]) data[userId] = { coins: 0 };
    data[userId].coins += amount;
    
    fs.writeFileSync(economyPath, JSON.stringify(data, null, 2));
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('jackpot')
        .setDescription('Start an automated jackpot that rewards coins to the winner')
        .addIntegerOption(option =>
            option.setName('coins')
                .setDescription('Amount of coins to reward')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('duration')
                .setDescription('Duration of the jackpot in minutes')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    category: 'Economy',

    async execute(interaction) {
        try {
            const coinAmount = interaction.options.getInteger('coins');
            const durationMinutes = interaction.options.getInteger('duration');
            const durationMs = durationMinutes * 60 * 1000;
            const endsAt = Date.now() + durationMs;

            const embed = new EmbedBuilder()
                .setColor(0xFFD700)
                .setTitle('🎰 THE SYNDICATE • AUTOMATIC COIN JACKPOT 🎰')
                .setDescription(`A new **Coin Jackpot** has started!\n\n` +
                    `🎁 **Prize:** ${coinAmount.toLocaleString()} Coins\n` +
                    `👤 **Host:** ${interaction.user}\n` +
                    `⏳ **Ends:** <t:${Math.floor(endsAt / 1000)}:R>\n\n` +
                    `👉 *Click the button below to join and win coins automatically!*`)
                .setFooter({ text: 'Current Participants: 0' })
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('join_jackpot')
                    .setLabel('Join Jackpot')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('🎟️')
            );

            await interaction.reply({ content: '✅ Automatic Coin Jackpot started successfully in this channel!', ephemeral: true });
            const jackpotMessage = await interaction.channel.send({ embeds: [embed], components: [row] });

            const entrants = new Set();
            const collector = jackpotMessage.createMessageComponentCollector({ time: durationMs });

            collector.on('collect', async i => {
                if (i.customId === 'join_jackpot') {
                    if (entrants.has(i.user.id)) {
                        return i.reply({ content: '⚠️ You are already entered into this Jackpot!', ephemeral: true });
                    }

                    entrants.add(i.user.id);

                    const updatedEmbed = EmbedBuilder.from(embed)
                        .setFooter({ text: `Current Participants: ${entrants.size}` });
                    
                    await jackpotMessage.edit({ embeds: [updatedEmbed] }).catch(() => {});
                    await i.reply({ content: '🎉 You have successfully joined the Jackpot!', ephemeral: true });
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
                        .setDescription(`🎁 **Prize:** ${coinAmount.toLocaleString()} Coins\n\n❌ **Jackpot Ended:** No users participated in time.`);
                    
                    return await jackpotMessage.edit({ embeds: [endedEmbed], components: [disabledRow] }).catch(() => {});
                }

                // Randomly pick a winner
                const winnerId = entrantsArray[Math.floor(Math.random() * entrantsArray.length)];

                // Automatically add coins to the winner's account
                addCoins(winnerId, coinAmount);

                const winnerEmbed = EmbedBuilder.from(embed)
                    .setColor(0x00FF00)
                    .setDescription(`🎁 **Prize:** ${coinAmount.toLocaleString()} Coins\n\n🏆 **Winner Drawn:** <@${winnerId}>\n🎉 Congratulations! The coins have been automatically added to your balance!`);

                await jackpotMessage.edit({ embeds: [winnerEmbed], components: [disabledRow] }).catch(() => {});
                await interaction.channel.send(`🎊 Congratulations <@${winnerId}>! You won **${coinAmount.toLocaleString()} coins** from the Jackpot, and they have been automatically credited to your account!`).catch(() => {});
            });

        } catch (error) {
            console.error('Error in automatic jackpot command:', error);
            if (!interaction.replied && !interaction.deferred) {
                return interaction.reply({ content: '❌ An error occurred while starting the automatic jackpot.', ephemeral: true });
            }
        }
    },
};
