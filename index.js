const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection, REST, Routes, EmbedBuilder } = require('discord.js');
const translate = require('@vitalets/google-translate-api');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers, // Role assign karne ke liye zaroori hai
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

// Message event handling (Auto-Translate, Gamertag Routing, Anti-Link, and Text Prefix Commands)
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

    // 2. Direct Gamertag & Platform Routing System
    if (message.channel.id === GAMERTAG_INPUT_CHANNEL_ID) {
        const content = message.content.toLowerCase();
        let targetChannelId = null;
        let platformName = '';

        if (content.includes('ps4')) {
            targetChannelId = PS4_CHANNEL_ID;
            platformName = 'PS4';
        } else if (content.includes('ps5')) {
            targetChannelId = PS5_CHANNEL_ID;
            platformName = 'PS5';
        } else if (content.includes('pc')) {
            targetChannelId = PC_CHANNEL_ID;
            platformName = 'PC';
        } else if (content.includes('non-gamer') || content.includes('nongamer')) {
            platformName = 'Non-Gamer';
        }

        if (platformName) {
            try {
                // Assign Verified Role
                const role = message.guild.roles.cache.find(r => r.name === VERIFIED_ROLE_NAME);
                if (role && !message.member.roles.cache.has(role.id)) {
                    await message.member.roles.add(role);
                }

                // Forward ID to target channel in your exact format
                if (targetChannelId) {
                    const targetChannel = message.guild.channels.cache.get(targetChannelId);
                    if (targetChannel) {
                        const idCard = new EmbedBuilder()
                            .setColor('#2b2d31')
                            .setDescription(
                                `User: **${message.author.tag}** (<@${message.author.id}>)\n` +
                                `Platform: **${platformName}**\n` +
                                `Gamertag ID:\n**${message.content}**`
                            );

                        await targetChannel.send({ embeds: [idCard] });
                    }
                }

                await message.delete().catch(() => {});
                const confirmMsg = await message.channel.send(`✅ Thank you <@${message.author.id}>! You have been verified and registered as **${platformName}**.`);
                setTimeout(() => confirmMsg.delete().catch(() => {}), 5000);

            } catch (error) {
                console.error('Gamertag routing error:', error);
            }
        } else {
            const warnMsg = await message.channel.send(`⚠️ Please mention your platform (**PS4**, **PS5**, **PC**, or **Non-Gamer**) along with your ID!`);
            setTimeout(() => {
                message.delete().catch(() => {});
                warnMsg.delete().catch(() => {});
            }, 6000);
        }
        return;
    }

    // 3. Anti-link security check with DM warning
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

    // 4. Handle text prefix commands (!command) as a fallback
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

// Handle Slash Commands execution
client.on('interactionCreate', async interaction => {
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
