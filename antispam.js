const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');

// Initialize an independent client for anti-spam monitoring
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildModeration
    ]
});

// Track message history for spam detection: Map<userId, timestampArray>
const userMessageHistory = new Map();

// Configuration limits
const SPAM_LIMIT = 5;     // Max messages allowed...
const TIME_WINDOW = 5000; // ...within 5 seconds (5000 ms)

client.once('ready', () => {
    console.log(`[Anti-Spam Monitor] Running independently as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
    // Ignore bots, system messages, or DMs
    if (message.author.bot || !message.guild) return;

    // Allow admins/moderators to bypass anti-spam if needed
    if (message.member && message.member.permissions.has('ManageMessages')) return;

    const userId = message.author.id;
    const now = Date.now();

    if (!userMessageHistory.has(userId)) {
        userMessageHistory.set(userId, []);
    }

    const timestamps = userMessageHistory.get(userId);
    
    // Filter out timestamps older than the time window
    const recentTimestamps = timestamps.filter(timestamp => now - timestamp < TIME_WINDOW);
    recentTimestamps.push(now);
    userMessageHistory.set(userId, recentTimestamps);

    // Check if user exceeded the spam limit
    if (recentTimestamps.length > SPAM_LIMIT) {
        try {
            // Delete the excessive spam message
            await message.delete().catch(() => {});

            // 1. Send a temporary warning message in the server chat
            const warning = await message.channel.send(`⚠️ **${message.author.username}**, please slow down! You are sending messages too fast.`);
            setTimeout(() => warning.delete().catch(() => {}), 4000);

            // 2. Send a Direct Message (DM) to the member
            const dmEmbed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('⚠️ Anti-Spam Warning')
                .setDescription(`You have been temporarily **timed out for 60 seconds** in **${message.guild.name}** for sending messages too quickly.\n\n` +
                    `*Please respect the chat rules and avoid flooding.*`)
                .setTimestamp();

            await message.author.send({ embeds: [dmEmbed] }).catch(() => {
                // If user has DMs closed, catch the error silently so the script doesn't crash
            });

            // 3. Timeout the user for 60 seconds
            if (message.member && message.member.moderatable) {
                await message.member.timeout(60 * 1000, 'Automated Anti-Spam: Message flooding').catch(() => {});
            }

            // Reset their history array to prevent continuous spam loops
            userMessageHistory.set(userId, []);

        } catch (error) {
            console.error('[Anti-Spam Error]:', error);
        }
    }
});

// Automatically reads the token from your panel environment variables
client.login(process.env.DISCORD_TOKEN);
