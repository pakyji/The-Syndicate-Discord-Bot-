const { EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const axios = require('axios');

const VERIFIED_ROLE_NAME = 'Verified';
const PS4_CHANNEL_ID = '901702088738865172';
const PS5_CHANNEL_ID = '1550856575495839824';
const PC_CHANNEL_ID = '1535658134230671370';
const GIVEAWAY_CHANNEL_ID = '1546252181920022538';

// GTA SOS Menu Constants & Memory Store
const MAIN_LFG_CHANNEL_ID = '1535656533919014932';
const ITALIAN_LFG_CHANNEL_ID = '1537221793922940928';
const userSelections = new Map();

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
            // 1. Reaction Role Button Handler (Dynamic auto-creation & toggle)
            if (interaction.isButton() && interaction.customId.startsWith('role_')) {
                const buttonKey = interaction.customId.replace('role_', '');
                
                let targetRoleName = '';
                if (buttonKey === 'ps4') targetRoleName = 'PS4';
                else if (buttonKey === 'ps5') targetRoleName = 'PS5';
                else if (buttonKey === 'pc') targetRoleName = 'PC';
                else if (buttonKey === 'pc_enhanced') targetRoleName = 'PC Enhanced';
                else if (buttonKey === 'xbox') targetRoleName = 'X Box Series';
                else if (buttonKey === 'switch') targetRoleName = 'Switch';
                else if (buttonKey === 'mobile') targetRoleName = 'Mobile User';
                else if (buttonKey === 'nongamer') targetRoleName = 'Non Gamer';

                if (!targetRoleName) return;

                let role = interaction.guild.roles.cache.find(r => r.name.toLowerCase() === targetRoleName.toLowerCase());
                if (!role) {
                    try {
                        role = await interaction.guild.roles.create({
                            name: targetRoleName,
                            reason: 'Auto-created by reaction roles system'
                        });
                    } catch (error) {
                        console.error(`Failed to create role ${targetRoleName}:`, error);
                        return await interaction.reply({ content: '⚠️ Failed to create the role. Please check bot permissions.', ephemeral: true });
                    }
                }

                const member = interaction.member;
                try {
                    if (member.roles.cache.has(role.id)) {
                        await member.roles.remove(role.id);
                        await interaction.reply({ content: `❌ Role **${role.name}** has been removed from you!`, ephemeral: true });
                    } else {
                        await member.roles.add(role.id);
                        await interaction.reply({ content: `✅ Role **${role.name}** has been added to you!`, ephemeral: true });
                    }
                } catch (error) {
                    console.error('Error toggling reaction role:', error);
                    await interaction.reply({ content: '⚠️ Failed to update your roles. Make sure the bot role is positioned higher than the target roles.', ephemeral: true });
                }
                return;
            }

            // 2. Verification Buttons
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

            // 3. Verification Modal Submit
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

            // 4. Secure Giveaway Modal Submit Handler
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

            // 5. GTA SOS Menu Handlers
            if (interaction.isButton() && interaction.customId === 'gta_sos_start') {
                const row = new ActionRowBuilder()
                    .addComponents(
                        new StringSelectMenuBuilder()
                            .setCustomId('gta_category_select')
                            .setPlaceholder('📂 Choose a GTA Activity / Heist category')
                            .addOptions([
                                { label: 'Cayo Perico Heist', value: 'cayo_perico', description: 'Complete setups and finale help' },
                                { label: 'Diamond Casino Heist', value: 'casino_heist', description: 'Vault approach, preps & finale' },
                                { label: 'The Doomsday Heist', value: 'doomsday', description: 'Act 1, 2, 3 setups & missions' },
                                { label: 'Classic Heists', value: 'classic_heists', description: 'Fleeca, Prison Break, Pacific Standard' },
                                { label: 'General Businesses / Sell', value: 'businesses', description: 'Bunker, MC, Nightclub sales or supplies' },
                                { label: 'Free Roam / CEO Work', value: 'free_roam', description: 'VIP work, Client jobs, or CEO missions' },
                                { label: 'LS Tuners / Contracts', value: 'ls_tuners', description: 'Auto Shop contracts & street races' },
                                { label: 'Salvage Yard & Cluckin Bell', value: 'salvage_yard', description: 'Robberies and raid setups' }
                            ])
                    );

                return await interaction.reply({
                    content: '🎯 **Select the GTA activity you need help with:**',
                    components: [row],
                    ephemeral: true
                });
            }

            if (interaction.isStringSelectMenu() && interaction.customId === 'gta_category_select') {
                const selectedCategory = interaction.values[0];
                userSelections.set(interaction.user.id, { category: selectedCategory });

                const row = new ActionRowBuilder()
                    .addComponents(
                        new StringSelectMenuBuilder()
                            .setCustomId('gta_platform_select')
                            .setPlaceholder('🎮 Select your gaming platform')
                            .addOptions([
                                { label: 'PlayStation 4 (PS4)', value: 'PS4', emoji: '🎮' },
                                { label: 'PlayStation 5 (PS5)', value: 'PS5', emoji: '🎮' },
                                { label: 'PC', value: 'PC', emoji: '🖥️' },
                                { label: 'Xbox (One / Series X|S)', value: 'Xbox', emoji: '🕹️' }
                            ])
                    );

                return await interaction.update({
                    content: `✅ Category selected: **${selectedCategory.replace('_', ' ').toUpperCase()}**\n\nNow, select your **Platform**:`,
                    components: [row]
                });
            }

            if (interaction.isStringSelectMenu() && interaction.customId === 'gta_platform_select') {
                const platform = interaction.values[0];
                const data = userSelections.get(interaction.user.id) || { category: 'General' };
                data.platform = platform;
                userSelections.set(interaction.user.id, data);

                const modal = new ModalBuilder()
                    .setCustomId('gta_note_modal')
                    .setTitle('📝 Add Optional Note / Details');

                const noteInput = new TextInputBuilder()
                    .setCustomId('user_custom_note')
                    .setLabel('Specific details (Mic, players, etc.)')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('E.g., Need 2 more players, mic required, hard mode...')
                    .setRequired(false)
                    .setMaxLength(250);

                const modalRow = new ActionRowBuilder().addComponents(noteInput);
                modal.addComponents(modalRow);

                return await interaction.showModal(modal);
            }

            if (interaction.isModalSubmit() && interaction.customId === 'gta_note_modal') {
                const customNote = interaction.fields.getTextInputValue('user_custom_note') || 'No additional notes provided.';
                const data = userSelections.get(interaction.user.id) || { category: 'General', platform: 'Unknown' };
                
                const category = data.category.replace('_', ' ').toUpperCase();
                const platform = data.platform;

                await interaction.reply({
                    content: '🎉 **SOS Request successfully submitted to LFG channels!**',
                    ephemeral: true
                });

                const lfgDescription = `🚨 **New GTA LFG SOS Request!**\n\n` +
                    `👤 **User:** <@${interaction.user.id}>\n` +
                    `🎯 **Activity:** ${category}\n` +
                    `🎮 **Platform:** ${platform}\n` +
                    `💬 **Note:** ${customNote}\n\n` +
                    `*React or message the user to join the crew!*`;

                const lfgEmbed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('🚨 GTA V SOS Alert')
                    .setDescription(lfgDescription)
                    .setTimestamp();

                const mainChannel = interaction.guild.channels.cache.get(MAIN_LFG_CHANNEL_ID) || await interaction.guild.channels.fetch(MAIN_LFG_CHANNEL_ID).catch(() => null);
                if (mainChannel) {
                    await mainChannel.send({ embeds: [lfgEmbed] });
                }

                const italianChannel = interaction.guild.channels.cache.get(ITALIAN_LFG_CHANNEL_ID) || await interaction.guild.channels.fetch(ITALIAN_LFG_CHANNEL_ID).catch(() => null);
                if (italianChannel) {
                    try {
                        const textToTranslate = `New GTA LFG SOS Request! Activity: ${category}, Platform: ${platform}, Note: ${customNote}, User: ${interaction.user.username}`;
                        const encoded = encodeURIComponent(textToTranslate);
                        const transRes = await axios.get(`https://api.mymemory.translated.net/get?q=${encoded}&langpair=en|it`);
                        const translatedText = transRes.data.responseData.translatedText || textToTranslate;

                        const italianEmbed = new EmbedBuilder()
                            .setColor('#00AAFF')
                            .setTitle('🚨 Avviso SOS GTA V')
                            .setDescription(`🚨 **Nuova Richiesta SOS GTA LFG!**\n\n` +
                                `👤 **Utente:** <@${interaction.user.id}>\n` +
                                `🎯 **Attività:** ${category}\n` +
                                `🎮 **Piattaforma:** ${platform}\n` +
                                `💬 **Nota:** ${customNote}\n\n` +
                                `*Reagisci o scrivi all'utente per unirti alla crew!*`)
                            .setTimestamp();

                        await italianChannel.send({ embeds: [italianEmbed] });
                    } catch (err) {
                        console.error('Italian translation error in SOS:', err);
                        await italianChannel.send({ embeds: [lfgEmbed] });
                    }
                }

                userSelections.delete(interaction.user.id);
                return;
            }

            // 6. Slash Commands Router
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
