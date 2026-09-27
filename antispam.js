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

            // Send a temporary warning message in chat
            const warning = await message.channel.send(`⚠️ **${message.author.username}**, please slow down! You are sending messages too fast.`);
            
            // Auto-delete the warning after 4 seconds to keep chat clean
            setTimeout(() => warning.delete().catch(() => {}), 4000);

            // Optional: Timeout the user for 60 seconds to stop severe flooding
            if (message.member && message.member.moderatable) {
                await message.member.timeout(60 * 1000, 'Automated Anti-Spam: Message flooding').catch(() => {});
            }

            // Reset their history array to prevent continuous spam triggering loops
            userMessageHistory.set(userId, []);

        } catch (error) {
            console.error('[Anti-Spam Error]:', error);
        }
    }
});

// Replace with your actual Discord Bot Token
client.login('YOUR_DISCORD_BOT_TOKEN');
