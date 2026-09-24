const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection, REST, Routes, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits } = require('discord.js');
const translate = require('translate-google-api');
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
                color: '#00FF00',
                reason: 'Auto-created by The Syndicate bot for member verification',
            });
            console.log(`Created missing '${VERIFIED_ROLE_NAME}' role in guild: ${guild.name}`);
        } catch (error) {
            console.error('Failed to create Verified role:', error);
        }
    }
    return role;
}

// Recursive function to load commands from subcategories/folders automatically
const loadCommands = (dir) => {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
            loadCommands(filePath); // Folders/Categories ke andar jao
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

client.once('ready', async () => {
    console.log(`The Syndicate is online and connected as ${client.user.tag}`);
    client.user.setActivity('The Syndicate Chat', { type: 2 });

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

// New Member Join Verification System
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

        const welcomeText = `Welcome to **${member.guild.name}**! Please use your private verification channel <#${verificationChannel.id}> to select your gaming platform and get verified.`;
        await member.send(welcomeText).catch(() => {});

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

// Message event handling (Translation & Anti-Link)
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    if (message.channel.id === TRANSLATION_CHANNEL_ID) {
        try {
            const result = await translate(message.content, { to: 'en' });
            const translatedText = Array.isArray(result) ? result[0] : result;
            if (translatedText && translatedText.toLowerCase() !== message.content.toLowerCase()) {
                await message.channel.send(`💬 **${message.author.username}:** ${translatedText}`);
                await message.delete().catch(() => {});
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

// Interaction Handling (Buttons, Modals, Slash Commands)
client.on('interactionCreate', async interaction => {
    try {
        if (interaction.isButton() && interaction.customId.startsWith('verify_')) {
            const platformKey = interaction.customId.replace('verify_', '');
            const role = await getOrCreateVerifiedRole(interaction.guild);

            if (platformKey === 'nongamer') {
                if (role && !interaction.member.roles.cache.has(role.id)) {
                    await interaction.member.roles.add(role);
                }
                await interaction.reply({ content: '✅ Verified successfully as Non-Gamer! This channel will now close.', ephemeral: true });
                setTimeout(() => { interaction.channel.delete().catch(() => {}); }, 5000);
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

            await interaction.reply({ content: `✅ Verified successfully! Your ${platformName} ID has been submitted. This channel will now close.`, ephemeral: true });
            setTimeout(() => { interaction.channel.delete().catch(() => {}); }, 5000);
            return;
        }

        if (!interaction.isChatInputCommand()) return;

        const command = client.commands.get(interaction.commandName);
        if (command) {
            await command.execute(interaction);
        }

    } catch (error) {
        console.error('Interaction error:', error);
        const errorReply = { content: 'An error occurred.', ephemeral: true };
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(errorReply).catch(() => {});
        } else {
            await interaction.reply(errorReply).catch(() => {});
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
