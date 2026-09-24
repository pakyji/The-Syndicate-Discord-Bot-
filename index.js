const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection, REST, Routes, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
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
const GAMERTAG_INPUT_CHANNEL_ID = '904332839758229544';
const PS4_CHANNEL_ID = '901702088738865172';
const PS5_CHANNEL_ID = '1550856575495839824';
const PC_CHANNEL_ID = '1535658134230671370';
const VERIFIED_ROLE_NAME = 'Verified';

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

    // Register slash commands globally
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

// Message event handling (Auto-Translate, Anti-Link, and Text Prefix Commands)
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    // 1. Auto-Translate feature for the specified channel
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

    // 2. Anti-link security check with DM warning
    const linkRegex = /(https?:\/\/[^\s]+|discord\.gg\/[^\s]+|www\.[^\s]+)/i;
    if (linkRegex.test(message.content)) {
        try {
            await message.delete();
            await message.author.send(`Hey! Links are not allowed in **${message.guild.name}**. Your message containing a link was deleted.`);
        } catch (error) {
            console.error('Could not send DM to the user:', error);
        }
        return;
    }

    // 3. Handle text prefix commands (!command)
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

// Handle Button Clicks, Modals, and Slash Commands
client.on('interactionCreate', async interaction => {
    // A. Button Clicks Handler
    if (interaction.isButton() && interaction.customId.startsWith('verify_')) {
        const platformKey = interaction.customId.replace('verify_', '');

        // Non-Gamer ke liye form ki zaroorat nahi
        if (platformKey === 'nongamer') {
            try {
                const role = interaction.guild.roles.cache.find(r => r.name === VERIFIED_ROLE_NAME);
                if (role && !interaction.member.roles.cache.has(role.id)) {
                    await interaction.member.roles.add(role);
                }
                return await interaction.reply({ content: '✅ You have been successfully verified as a **Non-Gamer**!', ephemeral: true });
            } catch (error) {
                console.error(error);
                return await interaction.reply({ content: 'Failed to verify. Please contact an admin.', ephemeral: true });
            }
        }

        // PS4, PS5, ya PC ke liye Modal (Popup Form) kholna
        const modal = new ModalBuilder()
            .setCustomId(`modal_${platformKey}`)
            .setTitle(`Enter your ${platformKey.toUpperCase()} ID`);

        const idInput = new TextInputBuilder()
            .setCustomId('gamertag_input')
            .setLabel('Gamertag ID=') // User ki requirement ke mutabiq label
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Type your ID here...')
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(idInput));
        return await interaction.showModal(modal);
    }

    // B. Modal Submit Handler
    if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_')) {
        const platformKey = interaction.customId.replace('modal_', '');
        const platformName = platformKey.toUpperCase();
        const gamertagId = interaction.fields.getTextInputValue('gamertag_input');

        try {
            // 1. Assign Verified Role
            const role = interaction.guild.roles.cache.find(r => r.name === VERIFIED_ROLE_NAME);
            if (role && !interaction.member.roles.cache.has(role.id)) {
                await interaction.member.roles.add(role);
            }

            // 2. Determine target channel ID
            let targetChannelId = '';
            if (platformKey === 'ps4') targetChannelId = PS4_CHANNEL_ID;
            if (platformKey === 'ps5') targetChannelId = PS5_CHANNEL_ID;
            if (platformKey === 'pc') targetChannelId = PC_CHANNEL_ID;

            // 3. Send to target channel in your exact format
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

            await interaction.reply({ content: `✅ Verified successfully! Your ${platformName} ID has been submitted.`, ephemeral: true });
        } catch (error) {
            console.error('Modal submit error:', error);
            await interaction.reply({ content: 'There was an error processing your submission.', ephemeral: true });
        }
        return;
    }

    // C. Slash Commands Handler
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
        await command.execute(interaction, []);
    } catch (error) {
        console.error(error);
        const errorReply = { content: 'There was an error executing this command.', ephemeral: true };
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(errorReply);
        } else {
            await interaction.reply(errorReply);
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
