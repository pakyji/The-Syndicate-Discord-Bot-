const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { Client, GatewayIntentBits, Collection, REST, Routes, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits } = require('discord.js');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates,
    ],
});

client.commands = new Collection();
client.musicQueues = new Map();
const commandsArray = [];

// Configurations & Channel IDs
const TRANSLATION_CHANNEL_ID = '1538595475794563167';
const PS4_CHANNEL_ID = '901702088738865172';
const PS5_CHANNEL_ID = '1550856575495839824';
const PC_CHANNEL_ID = '1535658134230671370';
const GIVEAWAY_CHANNEL_ID = '1546252181920022538';
const VERIFIED_ROLE_NAME = 'Verified';

// Memory map for automatic warnings tracking
const autoWarnings = new Map();

// Helper function to get or create the 'Verified' role
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

// Recursive function to load commands from subfolders (Dynamic Command Handler)
const loadCommands = (dir) => {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
            loadCommands(filePath);
        } else if (file.endsWith('.js')) {
            const command = require(filePath);
            if ('name' in command && 'execute' in command) {
                client.commands.set(command.name, command);
                commandsArray.push({
                    name: command.name,
                    description: command.description || 'No description provided',
                    options: command.options || []
                });
            }
        }
    }
};

const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
    loadCommands(commandsPath);
}

// Register slash commands when bot is ready
client.once('ready', async () => {
    console.log(`The Syndicate is online as ${client.user.tag}`);
    client.user.setActivity('HD music & chat', { type: 2 });

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commandsArray },
        );
        console.log('Successfully reloaded application slash commands.');
    } catch (error) {
        console.error('Command registration error:', error);
    }
});

// New Member Join Event
client.on('guildMemberAdd', async (member) => {
    try {
        await getOrCreateVerifiedRole(member.guild);

        const verificationChannel = await member.guild.channels.create({
            name: `verify-${member.user.username}`,
            type: ChannelType.GuildText,
            permissionOverwrites: [
                { id: member.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                { id: member.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
                { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] }
            ]
        });

        const embed = new EmbedBuilder()
            .setColor('#2b2d31')
            .setTitle('The Syndicate Verification')
            .setDescription('Welcome! Click your gaming platform below to unlock the server.');

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('verify_ps4').setLabel('PS4').setStyle(ButtonStyle.Primary).setEmoji('🎮'),
            new ButtonBuilder().setCustomId('verify_ps5').setLabel('PS5').setStyle(ButtonStyle.Primary).setEmoji('🎮'),
            new ButtonBuilder().setCustomId('verify_pc').setLabel('PC').setStyle(ButtonStyle.Success).setEmoji('💻'),
            new ButtonBuilder().setCustomId('verify_nongamer').setLabel('Non-Gamer').setStyle(ButtonStyle.Secondary).setEmoji('👤')
        );

        await verificationChannel.send({ content: `Hey <@${member.id}>! Welcome to the server.`, embeds: [embed], components: [row] });
    } catch (error) {
        console.error('GuildMemberAdd error:', error);
    }
});

// Message event handling (Translation & Automatic Moderation / Anti-Link / Auto-Warn Filter)
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    // Translation Feature
    if (message.channel.id === TRANSLATION_CHANNEL_ID) {
        try {
            const encodedText = encodeURIComponent(message.content);
            const response = await axios.get(`https://api.mymemory.translated.net/get?q=${encodedText}&langpair=autodetect|en`);
            const translatedText = response.data.responseData.translatedText;

            if (translatedText && translatedText.toLowerCase() !== message.content.toLowerCase()) {
                await message.channel.send(`💬 **${message.author.username}:** ${translatedText}`);
                await message.delete().catch(() => {});
            }
        } catch (error) {
            console.error('Translation error:', error);
        }
        return;
    }

    // Automatic Moderation Filter (Bad words & Links)
    const badWords = ['parolaccia1', 'parolaccia2']; // Apni zaroorat ke mutabiq words add kar sakte hain
    const contentLower = message.content.toLowerCase();
    const hasBadWord = badWords.some(word => contentLower.includes(word));
    
    const linkRegex = /(https?:\/\/[^\s]+|discord\.gg\/[^\s]+|www\.[^\s]+)/i;
    const hasLink = linkRegex.test(message.content);

    if (hasBadWord || hasLink) {
        try {
            await message.delete();

            const userId = message.author.id;
            const currentWarns = (autoWarnings.get(userId) || 0) + 1;
            autoWarnings.set(userId, currentWarns);

            const warningMsg = await message.channel.send(
                `⚠️ <@${userId}>, your message was deleted because it contained restricted content! (Auto-Warns: ${currentWarns}/3)`
            );
            
            setTimeout(() => warningMsg.delete().catch(() => {}), 5000);

            // Auto-action: 3 warn hone par 10 minutes ka automatic timeout
            if (currentWarns >= 3) {
                const member = await message.guild.members.fetch(userId).catch(() => null);
                if (member) {
                    await member.timeout(10 * 60 * 1000, 'Accumulated 3 automatic warnings');
                    await message.channel.send(`🚨 <@${userId}> has reached 3 auto-warns and has been put in **timeout** for 10 minutes!`);
                    autoWarnings.set(userId, 0);
                }
            }
        } catch (error) {
            console.error('Auto-moderation error:', error);
        }
        return;
    }
});

// Handle Interactions
client.on('interactionCreate', async interaction => {
    try {
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
});

client.login(process.env.DISCORD_TOKEN);
