const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection } = require('discord.js');
require('dotenv').config();

// Initialize the Discord client for "The Syndicate"
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

// Create a collection to hold all commands for easy management
client.commands = new Collection();

// Load commands dynamically from the "commands" folder (for scaling up to 200+ commands)
const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        if ('name' in command && 'execute' in command) {
            client.commands.set(command.name, command);
        }
    }
}

// Event: Triggered when "The Syndicate" goes online
client.once('ready', () => {
    console.log(`The Syndicate is online and connected as ${client.user.tag}`);
    // Set a simple, natural status without unnecessary show-off
    client.user.setActivity('the chat', { type: 3 }); // 3 means WATCHING
});

// Casual, natural response arrays to keep interactions human-like
const casualHellos = [
    "Hey! What's up?",
    "Yo, how's it going?",
    "Hello there!",
    "Sup? What brings you here?"
];

// Event: Handle incoming messages
client.on('messageCreate', async (message) => {
    // Ignore messages from bots or messages without a prefix (using '!')
    if (message.author.bot || !message.content.startsWith('!')) return;

    const args = message.content.slice(1).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();

    // Check if command exists in our modular collection
    const command = client.commands.get(commandName);
    if (command) {
        try {
            await command.execute(message, args);
            return;
        } catch (error) {
            console.error(error);
            return;
        }
    }

    // Built-in simple fallback commands for quick testing
    if (commandName === 'ping') {
        message.reply('Pong!');
    }

    if (commandName === 'hello' || commandName === 'hi') {
        await message.channel.sendTyping();
        const randomResponse = casualHellos[Math.floor(Math.random() * casualHellos.length)];
        setTimeout(() => {
            message.reply(randomResponse);
        }, 800);
    }
});

// Login securely using environment variable from Bot-hosting.net
client.login(process.env.DISCORD_TOKEN);
