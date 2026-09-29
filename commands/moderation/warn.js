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

// Track message history and content for spam detection: Map<userId, { timestamps: [], lastContent: string, duplicateCount: number }>
const userActivity = new Map();

// Configuration limits
const SPAM_LIMIT = 4;     // Max messages allowed...
const TIME_WINDOW = 6000; // ...within 6 seconds

client.once('ready', () => {
    console.log(`[Anti-Spam & Anti-Flood Monitor] Running independently as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
    // Ignore bots, system messages, or DMs
    if (message.author.bot || !message.guild) return;

    // Allow admins/moderators to bypass anti-spam
    if (message.member && message.member.permissions.has('ManageMessages')) return;

    const userId = message.author.id;
    const now = Date.now();
    const content = message.content.trim();
    const hasAttachment = message.attachments.size > 0;

    if (!userActivity.has(userId)) {
        userActivity.set(userId, { timestamps: [], lastContent: '', duplicateCount: 0 });
    }

    const userData = userActivity.get(userId);
    
    // 1. Filter out timestamps older than the time window
    userData.timestamps = userData.timestamps.filter(timestamp => now - timestamp < TIME_WINDOW);
    userData.timestamps.push(now);

    // 2. Check for Duplicate Content Spam (Skip if the message contains an image/attachment)
    if (!hasAttachment) {
        if (content.length > 0 && userData.lastContent === content) {
            userData.duplicateCount += 1;
        } else {
            userData.lastContent = content;
            userData.duplicateCount = 1;
        }
    }

    // Determine if spam criteria is met (either too fast or repeating same text 3+ times)
    const isFastSpam = userData.timestamps.length > SPAM_LIMIT;
    const isDuplicateSpam = !hasAttachment && userData.duplicateCount >= 3;

    if (isFastSpam || isDuplicateSpam) {
        try {
            // Delete the excessive spam message
            await message.delete().catch(() => {});

            // Send a temporary warning message in the server chat
            const warning = await message.channel.send(`⚠️ **${message.author.username}**, please stop spamming or flooding the chat!`);
            setTimeout(() => warning.delete().catch(() => {}), 4000);

            // Send a Direct Message (DM) to the member
            const dmEmbed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('⚠️ Anti-Spam / Flood Warning')
                .setDescription(`You have been temporarily **timed out for 60 seconds** in **${message.guild.name}** for sending repetitive messages or flooding the chat.\n\n` +
                    `*Please follow the server rules.*`)
                .setTimestamp();

            await message.author.send({ embeds: [dmEmbed] }).catch(() => {});

            // Timeout the user for 60 seconds
            if (message.member && message.member.moderatable) {
                await message.member.timeout(60 * 1000, 'Automated Anti-Spam: Repetitive flood/spam').catch(() => {});
            }

            // Reset user activity data to prevent infinite loops
            userActivity.set(userId, { timestamps: [], lastContent: '', duplicateCount: 0 });

        } catch (error) {
            console.error('[Anti-Spam Error]:', error);
        }
    }
});

// Automatically reads the token from your panel environment variables
client.login(process.env.DISCORD_TOKEN);
