const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

client.commands = new Collection();
const commandsArray = [];

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

// Anti-link security check with DM warning
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

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

    // Handle text prefix commands (!command) as a fallback
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
