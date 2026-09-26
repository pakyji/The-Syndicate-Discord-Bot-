const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    name: 'ready',
    once: true,
    async execute(client) {
        console.log(`The Syndicate is online as ${client.user.tag}`);
        client.user.setActivity('HD music & chat', { type: 2 });

        // 1. Initialize invites cache for invite tracker
        global.invitesCache = new Map();
        for (const [guildId, guild] of client.guilds.cache) {
            try {
                const invites = await guild.invites.fetch();
                global.invitesCache.set(guildId, new Map(invites.map(inv => [inv.code, inv.uses])));
            } catch (err) {
                console.error(`Could not fetch invites for guild ${guild.name}:`, err);
            }
        }
        console.log('Invite tracker cache initialized successfully!');

        // 2. Automatic Coin Drop System
        const TARGET_CHANNEL_ID = '1536498743505846393'; // Target channel ID for auto drops
        const DROP_INTERVAL = 30 * 60 * 1000; // Automatic drop every 30 minutes

        setInterval(async () => {
            try {
                const channel = await client.channels.fetch(TARGET_CHANNEL_ID).catch(() => null);
                if (!channel) return;

                const amount = Math.floor(Math.random() * 100) + 50; // Random amount between 50 and 150 coins

                const embed = new EmbedBuilder()
                    .setColor('#FFD700')
                    .setTitle('🪙 Automatic Coin Drop!')
                    .setDescription(`**${amount} Coins** have dropped on the ground!\nClick the button below to claim them first!`)
                    .setFooter({ text: 'The Syndicate Auto Drop' })
                    .setTimestamp();

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('claim_coin_auto')
                        .setLabel('Grab Coins! 🏃‍♂️')
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('🪙')
                );

                const message = await channel.send({ embeds: [embed], components: [row] });

                // Button collector active for 30 seconds
                const collector = message.createMessageComponentCollector({ time: 30000 });
                let claimed = false;

                collector.on('collect', async i => {
                    if (claimed) {
                        return i.reply({ content: '❌ These coins have already been claimed by someone else!', ephemeral: true });
                    }

                    claimed = true;

                    const winnerEmbed = new EmbedBuilder()
                        .setColor('#00FF00')
                        .setTitle('🪙 Coin Drop Claimed!')
                        .setDescription(`🎉 **${i.user}** was the first to grab **${amount} Coins**!`)
                        .setTimestamp();

                    const disabledRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId('claim_coin_auto')
                            .setLabel('Claimed ❌')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(true)
                    );

                    await i.update({ embeds: [winnerEmbed], components: [disabledRow] });
                });

                collector.on('end', async () => {
                    if (!claimed) {
                        const expiredEmbed = new EmbedBuilder()
                            .setColor('#808080')
                            .setTitle('🪙 Coin Drop Expired')
                            .setDescription('Nobody claimed the coins in time, the coins have vanished!');

                        const disabledRow = new ActionRowBuilder().addComponents(
                            new ButtonBuilder()
                                .setCustomId('claim_coin_auto')
                                .setLabel('Expired ⌛')
                                .setStyle(ButtonStyle.Secondary)
                                .setDisabled(true)
                        );

                        await message.edit({ embeds: [expiredEmbed], components: [disabledRow] }).catch(() => {});
                    }
                });

            } catch (error) {
                console.error('Error in automatic coin drop:', error);
            }
        }, DROP_INTERVAL);
    },
};
