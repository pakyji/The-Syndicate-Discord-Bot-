const { EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const VERIFIED_ROLE_NAME = 'Verified';
const PS4_CHANNEL_ID = '901702088738865172';
const PS5_CHANNEL_ID = '1550856575495839824';
const PC_CHANNEL_ID = '1535658134230671370';
const GIVEAWAY_CHANNEL_ID = '1546252181920022538';

async function getOrCreateVerifiedRole(guild) {
    let role = guild.roles.cache.find(r => r.name === VERIFIED_ROLE_NAME);
    if (!role) {
        try {
            role = await guild.roles.create({
                name: VERIFIED_ROLE_NAME,
                color: '#00FF00',
                reason: 'Auto-created by The Syndicate bot for member verification',
            });
        } catch (error) {
            console.error('Failed to create Verified role:', error);
        }
    }
    return role;
}

module.exports = {
    name: 'interactionCreate',
    async execute(interaction, client) {
        try {
            // Verification Buttons
            if (interaction.isButton() && interaction.customId.startsWith('verify_')) {
                const platformKey = interaction.customId.replace('verify_', '');
                const role = await getOrCreateVerifiedRole(interaction.guild);

                if (platformKey === 'nongamer') {
                    if (role && !interaction.member.roles.cache.has(role.id)) {
                        await interaction.member.roles.add(role);
                    }
                    
                    if (interaction.channel.name.startsWith('verify-')) {
                        await interaction.reply({ content: '✅ Verified successfully! Channel will close shortly.', ephemeral: true });
                        setTimeout(() => { interaction.channel.delete().catch(() => {}); }, 5000);
                    } else {
                        await interaction.reply({ content: '✅ Verified successfully!', ephemeral: true });
                    }
                    return;
                }

                const modal = new ModalBuilder()
                    .setCustomId(`modal_${platformKey}`)
                    .setTitle(`Enter your ${platformKey.toUpperCase()} ID`);

                const idInput = new TextInputBuilder()
                    .setCustomId('gamertag_input')
                    .setLabel('Gamertag ID')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Type your ID here...')
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(idInput));
                return await interaction.showModal(modal);
            }

            // Verification Modal Submit
            if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_')) {
                const platformKey = interaction.customId.replace('modal_', '');
                const platformName = platformKey.toUpperCase();
                const gamertagId = interaction.fields.getTextInputValue('gamertag_input');

                const role = await getOrCreateVerifiedRole(interaction.guild);
                if (role && !interaction.member.roles.cache.has(role.id)) {
                    await interaction.member.roles.add(role);
                }

                let targetChannelId = '';
                if (platformKey === 'ps4') targetChannelId = PS4_CHANNEL_ID;
                if (platformKey === 'ps5') targetChannelId = PS5_CHANNEL_ID;
                if (platformKey === 'pc') targetChannelId = PC_CHANNEL_ID;

                if (targetChannelId) {
                    const targetChannel = interaction.guild.channels.cache.get(targetChannelId);
                    if (targetChannel) {
                        const idCard = new EmbedBuilder()
                            .setColor('#2b2d31')
                            .setDescription(`User: **${interaction.user.tag}** (<@${interaction.user.id}>)\nPlatform: **${platformName}**\nGamertag ID:\n**${gamertagId}**`);
                        await targetChannel.send({ embeds: [idCard] });
                    }
                }

                if (interaction.channel.name.startsWith('verify-')) {
                    await interaction.reply({ content: `✅ Verified successfully! Channel will close shortly.`, ephemeral: true });
                    setTimeout(() => { interaction.channel.delete().catch(() => {}); }, 5000);
                } else {
                    await interaction.reply({ content: `✅ Verified successfully!`, ephemeral: true });
                }
                return;
            }

            // Secure Giveaway Modal Submit Handler
            if (interaction.isModalSubmit() && interaction.customId === 'secure_giveaway_modal') {
                const prize = interaction.fields.getTextInputValue('gw_prize');
                const durationStr = interaction.fields.getTextInputValue('gw_duration');
                const hostName = interaction.fields.getTextInputValue('gw_host');
                const minInvites = parseInt(interaction.fields.getTextInputValue('gw_min_invites')) || 0;
                const customMsg = interaction.fields.getTextInputValue('gw_message') || 'Click the button below to join!';

                const match = durationStr.match(/^(\d+)([smhd])$/);
                if (!match) {
                    return await interaction.reply({ content: '❌ Invalid duration format! Use `10s`, `1m`, `1h`, or `1d`.', ephemeral: true });
                }

                const value = parseInt(match[1]);
                const unit = match[2];
                let ms = value * 1000;
                if (unit === 'm') ms = value * 60 * 1000;
                if (unit === 'h') ms = value * 60 * 60 * 1000;
                if (unit === 'd') ms = value * 24 * 60 * 60 * 1000;

                const endsAt = Date.now() + ms;

                let reqsText = [];
                if (minInvites > 0) reqsText.push(`• Minimum Invites: **${minInvites}**`);
                reqsText.push(`• Required Role: **Verified** (Automatic check)`);

                const embed = new EmbedBuilder()
                    .setColor('#2b2d31')
                    .setTitle('🎉 SECURE GIVEAWAY 🎉')
                    .setDescription(`**Prize:** ${prize}\n**Host:** ${hostName}\n**Ends:** <t:${Math.floor(endsAt / 1000)}:R>\n\n💬 *${customMsg}*\n\n🔒 **Requirements:**\n${reqsText.join('\n')}`)
                    .setFooter({ text: 'Bot will automatically verify your invites & role on click!' });

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('join_secure_gw')
                        .setLabel('Join Giveaway')
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('🎉')
                );

                const targetChannel = interaction.guild.channels.cache.get(GIVEAWAY_CHANNEL_ID);
                if (!targetChannel) {
                    return await interaction.reply({ content: '❌ Giveaway channel not found! Please check the channel ID.', ephemeral: true });
                }

                await interaction.reply({ content: '✅ Giveaway successfully launched in the target channel!', ephemeral: true });
                const giveawayMessage = await targetChannel.send({ embeds: [embed], components: [row] });

                const entrants = new Set();
                const collector = giveawayMessage.createMessageComponentCollector({ time: ms });

                collector.on('collect', async (i) => {
                    if (i.customId === 'join_secure_gw') {
                        const member = i.member;

                        const verifiedRole = i.guild.roles.cache.find(r => r.name === VERIFIED_ROLE_NAME);
                        if (verifiedRole && !member.roles.cache.has(verifiedRole.id)) {
                            return await i.reply({ content: '❌ You must have the **Verified** role to enter this giveaway!', ephemeral: true });
                        }

                        if (minInvites > 0) {
                            try {
                                const guildInvites = await i.guild.invites.fetch();
                                const userInvites = guildInvites.filter(inv => inv.inviter && inv.inviter.id === i.user.id);
                                const totalInvites = userInvites.reduce((sum, inv) => sum + inv.uses, 0);

                                if (totalInvites < minInvites) {
                                    return await i.reply({ content: `❌ Verification Failed! You need at least **${minInvites}** invites. (Your current invites: ${totalInvites})`, ephemeral: true });
                                }
                            } catch (err) {
                                console.error('Invite fetch error:', err);
                            }
                        }

                        if (entrants.has(i.user.id)) {
                            return await i.reply({ content: '⚠️ You have already entered this giveaway!', ephemeral: true });
                        }

                        entrants.add(i.user.id);
                        await i.reply({ content: '✅ Successfully verified and entered the giveaway!', ephemeral: true });
                    }
                });

                collector.on('end', async () => {
                    const entrantsArray = Array.from(entrants);
                    const disabledRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId('join_secure_gw')
                            .setLabel('Giveaway Ended')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(true)
                            .setEmoji('🔒')
                    );

                    if (entrantsArray.length === 0) {
                        const endedEmbed = EmbedBuilder.from(embed)
                            .setDescription(`**Prize:** ${prize}\n\n❌ Giveaway ended with no valid participants.`);
                        return await giveawayMessage.edit({ embeds: [endedEmbed], components: [disabledRow] }).catch(() => {});
                    }

                    const winnerId = entrantsArray[Math.floor(Math.random() * entrantsArray.length)];
                    const winnerEmbed = EmbedBuilder.from(embed)
                        .setDescription(`**Prize:** ${prize}\n\n🏆 **Winner:** <@${winnerId}>\nCongratulations!`);

                    await giveawayMessage.edit({ embeds: [winnerEmbed], components: [disabledRow] }).catch(() => {});
                    await targetChannel.send(`🎉 Congratulations <@${winnerId}>! You won **${prize}**!`).catch(() => {});
                });
                return;
            }

            // Slash Commands Router
            if (!interaction.isChatInputCommand()) return;

            const command = client.commands.get(interaction.commandName);
            if (command) {
                await command.execute(interaction);
            }

        } catch (error) {
            console.error('Interaction error:', error);
            const errorReply = { content: `❌ Error: ${error.message}`, ephemeral: true };
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(errorReply).catch(() => {});
            } else {
                await interaction.reply(errorReply).catch(() => {});
            }
        }
    },
};
