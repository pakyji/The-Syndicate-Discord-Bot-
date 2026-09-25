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

// Register Slash Commands Automatically on Startup & Set Rotating Custom Statuses
client.once('ready', async () => {
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        if (process.env.GUILD_ID) {
            await rest.put(
                Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID),
                { body: commandsArray },
            );
            console.log('✅ Commands successfully registered instantly in your guild using GUILD_ID from panel!');
        } else {
            await rest.put(
                Routes.applicationCommands(client.user.id),
                { body: commandsArray },
            );
            console.log('✅ Commands successfully registered globally!');
        }

        console.log('✅ The Syndicate bot is online with Zero-Touch Modular Architecture!');
    } catch (error) {
        console.error('Command registration error:', error);
    }

    // Configurazione dello stato personalizzato alternato (Visual Studio Code <-> Ubuntu/Linux)
    const statuses = [
        { name: 'Visual Studio Code', type: ActivityType.Custom, state: 'Visual Studio Code' },
        { name: 'Ubuntu/Linux', type: ActivityType.Custom, state: 'Ubuntu/Linux' }
    ];

    let index = 0;
    // Imposta subito il primo stato all'avvio
    client.user.setPresence({ activities: [statuses[index]], status: 'online' });

    // Cambia lo stato ogni 10 secondi (10000 ms)
    setInterval(() => {
        index = (index + 1) % statuses.length;
        client.user.setPresence({
            activities: [statuses[index]],
            status: 'online',
        });
    }, 10000);
});

client.login(process.env.DISCORD_TOKEN);
