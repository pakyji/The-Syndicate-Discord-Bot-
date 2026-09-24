const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
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

// Register Slash Commands Automatically on Startup
client.once('ready', async () => {
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commandsArray });
        console.log('✅ The Syndicate bot is online with Zero-Touch Modular Architecture!');
    } catch (error) {
        console.error('Command registration error:', error);
    }
});

client.login(process.env.DISCORD_TOKEN);
