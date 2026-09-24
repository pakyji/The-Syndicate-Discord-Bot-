const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection, REST, Routes, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits } = require('discord.js');
const translate = require('@vitalets/google-translate-api');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
    ],
});

client.commands = new Collection();
const commandsArray = [];

// Configurations & Channel IDs
const TRANSLATION_CHANNEL_ID = '1538595475794563167';
const PS4_CHANNEL_ID = '901702088738865172';
const PS5_CHANNEL_ID = '1550856575495839824';
const PC_CHANNEL_ID = '1535658134230671370';
const VERIFIED_ROLE_NAME = 'Verified';

// Helper function to get or automatically create the 'Verified' role
async function getOrCreateVerifiedRole(guild) {
    let role = guild.roles.cache.find(r => r.name === VERIFIED_ROLE_NAME);
    if (!role) {
        try {
            role = await guild.roles.create({
                name: VERIFIED_ROLE_NAME,
                color: '#00FF00', // Green color for verified members
                reason: 'Auto-created by The Syndicate bot for member verification',
            });
            console.log(`Created missing '${VERIFIED_ROLE_NAME}' role in guild: ${guild.name}`);
        } catch (error) {
            console.error('Failed to create Verified role:', error);
        }
    }
    return role;
}

// Load command files dynamically
const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        if ('name' in command && 'execute' in command) {
            client.commands.set(command.name, command);
            commandsArray.push({
                name: command.name,
                description: command.description || 'No description provided'
            });
        }
    }
}

client.once('ready', async () => {
    console.log(`The Syndicate is online and connected as ${client.user.tag}`);
    client.user.setActivity('the chat', { type: 3 });

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        console.log('Refreshing application slash commands...');
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commandsArray },
        );
        console.log('Successfully reloaded application slash commands.');
    } catch (error) {
        console.error(error);
    }
});

// 1. New Member Join: Create a private temporary verification channel & send DM
client.on('guildMemberAdd', async (member) => {
    try {
        // Ensure the Verified role exists when someone joins
        await getOrCreateVerifiedRole(member.guild);

        // Create a private channel visible ONLY to this specific user and the bot
        const verificationChannel = await member.guild.channels.create({
            name: `verify-${member.user.username}`,
            type: ChannelType.GuildText,
            permissionOverwrites: [
                {
                    id: member.guild.id, // @everyone
                    deny: [PermissionFlagsBits.ViewChannel],
                },
                {
                    id: member.id, // The new user
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
                },
                {
                    id: client.user.id, // The bot
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels],
                }
            ]
        });

        const welcomeText = `Welcome to **${member.guild.name}**! Please use your private verification channel <#${verificationChannel.id}> to select your gaming platform and get verified.`;

        // Send DM
        await member.send(welcomeText).catch(() => {});

        // Send the Verification Panel inside their private channel
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

        await verificationChannel.send({
            content: `Hey <@${member.id}>! Welcome to the server.`,
            embeds: [embed],
            components: [row]
        });

    } catch (error) {
        console.error('GuildMemberAdd error:', error);
    }
});

// Message event handling (Auto-Translate, Anti-Link, and Text Prefix Commands)
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    if (message.channel.id === TRANSLATION_CHANNEL_ID) {
        try {
            const res = await translate(message.content, { to: 'en' });
            if (res.text.toLowerCase() !== message.content.toLowerCase()) {
                await message.channel.send(`🌐 **Translation (${message.author.username}):** ${res.text}`);
            }
        } catch (error) {
            console.error('Translation error:', error);
        }
        return;
    }

    const linkRegex = /(https?:\/\/[^\s]+|discord\.gg\/[^\s]+|www\.[^\s]+)/i;
    if (linkRegex.test(message.content)) {
        try {
            await message.delete();
            await message.author.send(`Hey! Links are not allowed in **${message.guild.name}**.`);
        } catch (error) {}
        return;
    }

    if (!message.content.startsWith('!')) return;
    const args = message.content.slice(1).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();
    const command = client.commands.get(commandName);
    if (command) {
        try {
            await command.execute(message, args);
        } catch (error) {
            console.error(error);
        }
    }
});

// Handle Button Clicks, Modals, and Deleting the Channel on Success
client.on('interactionCreate', async interaction => {
    try {
        if (interaction.isButton() && interaction.customId.startsWith('verify_')) {
            const platformKey = interaction.customId.replace('verify_', '');

            // Get or create Verified role automatically
            const role = await getOrCreateVerifiedRole(interaction.guild);

            if (platformKey === 'nongamer') {
                if (role && !interaction.member.roles.cache.has(role.id)) {
                    await interaction.member.roles.add(role);
                }
                
                await interaction.reply({ content: '✅ Verified successfully as Non-Gamer! This channel will now close.', ephemeral: true });
                
                // Delete temporary verification channel after 5 seconds
                setTimeout(() => {
                    interaction.channel.delete().catch(() => {});
                }, 5000);
                return;
            }

            const modal = new ModalBuilder()
                .setCustomId(`modal_${platformKey}`)
                .setTitle(`Enter your ${platformKey.toUpperCase()} ID`);

            const idInput = new TextInputBuilder()
                .setCustomId('gamertag_input')
                .setLabel('Gamertag ID=')
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

            // Get or create Verified role automatically
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
                        .setDescription(
                            `User: **${interaction.user.tag}** (<@${interaction.user.id}>)\n` +
                            `Platform: **${platformName}**\n` +
                            `Gamertag ID:\n**${gamertagId}**`
                        );
                    await targetChannel.send({ embeds: [idCard] });
                }
            }

            await interaction.reply({ content: `✅ Verified successfully! Your ${platformName} ID has been submitted. This channel will now close.`, ephemeral: true });

            // Delete temporary verification channel after 5 seconds
            setTimeout(() => {
                interaction.channel.delete().catch(() => {});
            }, 5000);
            return;
        }

        if (!interaction.isChatInputCommand()) return;
        const command = client.commands.get(interaction.commandName);
        if (!command) return;
        await command.execute(interaction, []);

    } catch (error) {
        console.error('Interaction error:', error);
        const errorReply = { content: 'Si è verificato un errore.', ephemeral: true };
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(errorReply).catch(() => {});
        } else {
            await interaction.reply(errorReply).catch(() => {});
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
