const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection, REST, Routes, ActivityType } = require('discord.js');
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
client.autoWarnings = new Map();

// 1. Dynamic Command Loader (Recursively scans 'commands/' folder)
const commandsArray = [];
const loadCommands = (dir) => {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const filePath = path.join(dir, file);
        if (fs.statSync(filePath).isDirectory()) {
            loadCommands(filePath);
        } else if (file.endsWith('.js')) {
            const command = require(filePath);
            
            // Support for both SlashCommandBuilder (.data) and direct .name
            const commandData = command.data ? command.data.toJSON() : command;
            const commandName = command.data ? command.data.name : command.name;

            if (commandName && (command.execute || command.run)) {
                client.commands.set(commandName, command);
                commandsArray.push({
                    name: commandName,
                    description: commandData.description || 'No description provided',
                    options: commandData.options || []
                });
            }
        }
    }
};

const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) loadCommands(commandsPath);

// 2. Dynamic Event/Interaction Loader (Recursively scans 'events/' folder)
const loadEvents = (dir) => {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const filePath = path.join(dir, file);
        if (fs.statSync(filePath).isDirectory()) {
            loadEvents(filePath);
        } else if (file.endsWith('.js')) {
            const event = require(filePath);
            if (event.once) {
                client.once(event.name, (...args) => event.execute(...args, client));
            } else {
                client.on(event.name, (...args) => event.execute(...args, client));
            }
        }
    }
};

const eventsPath = path.join(__dirname, 'events');
if (fs.existsSync(eventsPath)) loadEvents(eventsPath);

// Register Slash Commands Automatically on Startup & Set Rotating Playing Statuses Every 30 Minutes
client.once('ready', async () => {
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        // Remove duplicate commands to prevent double listing
        const uniqueCommandsArray = Array.from(
            new Map(commandsArray.map(cmd => [cmd.name, cmd])).values()
        );

        if (process.env.GUILD_ID) {
            await rest.put(
                Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID),
                { body: uniqueCommandsArray },
            );
            console.log('✅ Commands successfully registered instantly in your guild using GUILD_ID from panel!');
        } else {
            await rest.put(
                Routes.applicationCommands(client.user.id),
                { body: uniqueCommandsArray },
            );
            console.log('✅ Commands successfully registered globally!');
        }

        console.log('✅ The Syndicate bot is online with Zero-Touch Modular Architecture!');
    } catch (error) {
        console.error('Command registration error:', error);
    }

    const statuses = [
        { name: 'Visual Studio Code', type: ActivityType.Playing },
        { name: 'Ubuntu/Linux', type: ActivityType.Playing },
        { name: 'The Syndicate - Community Bot', type: ActivityType.Playing }
    ];

    let index = 0;
    client.user.setPresence({ activities: [statuses[index]], status: 'online' });

    setInterval(() => {
        index = (index + 1) % statuses.length;
        client.user.setPresence({
            activities: [statuses[index]],
            status: 'online',
        });
        console.log(`🔄 Bot status updated to playing: ${statuses[index].name}`);
    }, 30 * 60 * 1000);
});

client.login(process.env.DISCORD_TOKEN);
