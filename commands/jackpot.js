const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('jackpot')
        .setDescription('Start an interactive giveaway or jackpot for members')
        .addStringOption(option =>
            option.setName('prize')
                .setDescription('The prize (e.g. 5000 Coins, VIP Role)')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('duration')
                .setDescription('Duration of the jackpot in minutes')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator), // Admin only

    category: 'Economy',

    async execute(interaction) {
        try {
            const prize = interaction.options.getString('prize');
            const durationMinutes = interaction.options.getInteger('duration');
            const durationMs = durationMinutes * 60 * 1000;
            const endsAt = Date.now() + durationMs;

            const embed = new EmbedBuilder()
                .setColor(0xFFD700)
                .setTitle('🎰 THE SYNDICATE • JACKPOT / LOTTERY 🎰')
                .setDescription(`A new **Jackpot** has been started!\n\n` +
                    `🎁 **Prize:** ${prize}\n` +
                    `👤 **Host:** ${interaction.user}\n` +
                    `⏳ **Ends:** <t:${Math.floor(endsAt / 1000)}:R>\n\n` +
                    `👉 *Click the button below to join the draw!*`)
                .setFooter({ text: 'Current Participants: 0' })
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('join_jackpot')
                    .setLabel('Join Jackpot')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('🎟️')
            );

            await interaction.reply({ content: '✅ Jackpot successfully started in this channel!', ephemeral: true });
            const jackpotMessage = await interaction.channel.send({ embeds: [embed], components: [row] });

            const entrants = new Set();
            const collector = jackpotMessage.createMessageComponentCollector({ time: durationMs });

            collector.on('collect', async i => {
                if (i.customId === 'join_jackpot') {
                    if (entrants.has(i.user.id)) {
                        return i.reply({ content: '⚠️ You are already entered into this Jackpot!', ephemeral: true });
                    }

                    entrants.add(i.user.id);

                    // Update participant counter in the embed
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
                        .setDescription(`🎁 **Prize:** ${prize}\n\n❌ **Jackpot Ended:** No users participated in time.`);
                    
                    return await jackpotMessage.edit({ embeds: [endedEmbed], components: [disabledRow] }).catch(() => {});
                }

                // Randomly pick a winner
                const winnerId = entrantsArray[Math.floor(Math.random() * entrantsArray.length)];

                const winnerEmbed = EmbedBuilder.from(embed)
                    .setColor(0x00FF00)
                    .setDescription(`🎁 **Prize:** ${prize}\n\n🏆 **Winner Drawn:** <@${winnerId}>\n🎉 Congratulations! You won the jackpot!`);

                await jackpotMessage.edit({ embeds: [winnerEmbed], components: [disabledRow] }).catch(() => {});
                await interaction.channel.send(`🎊 Congratulations <@${winnerId}>! You won **${prize}** in the Jackpot!`).catch(() => {});
            });

        } catch (error) {
            console.error('Error in jackpot command:', error);
            if (!interaction.replied && !interaction.deferred) {
                return interaction.reply({ content: '❌ An error occurred while starting the jackpot.', ephemeral: true });
            }
        }
    },
};
