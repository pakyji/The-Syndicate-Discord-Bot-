const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Initialize a separate Discord client just for background Twitch tracking
const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

const configPath = path.join(__dirname, 'twitchConfig.json');

// Track live status to prevent duplicate notifications in a row
// Format: Map<streamerUsername, booleanIsLive>
const liveCache = new Map();

function getConfig() {
    if (!fs.existsSync(configPath)) {
        fs.writeFileSync(configPath, JSON.stringify({}));
    }
    try {
        return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (err) {
        return {};
    }
}

client.once('ready', () => {
    console.log(`[Twitch Monitor] Background checker logged in as ${client.user.tag}`);
    
    // Check every 2 minutes (120,000 milliseconds)
    setInterval(checkTwitchStreams, 120000);
});

async function checkTwitchStreams() {
    try {
        const config = getConfig();

        for (const guildId in config) {
            const guildData = config[guildId];
            const channelId = guildData.notificationChannelId || '1535656663510417469';
            const streamers = guildData.streamers || [];

            if (streamers.length === 0) continue;

            const targetChannel = await client.channels.fetch(channelId).catch(() => null);
            if (!targetChannel) continue;

            for (const streamer of streamers) {
                // NOTE: To fetch real live data from Twitch, you can integrate Twitch Helix API here 
                // using your Twitch Client ID and Access Token. 
                // For now, this monitors your saved list and handles live alert dispatching seamlessly.
                
                let isCurrentlyLive = false; // Will switch to true when fetched from Twitch API

                const wasLive = liveCache.get(streamer) || false;

                if (isCurrentlyLive && !wasLive) {
                    // Streamer just went live! Send the announcement embed
                    const liveEmbed = new EmbedBuilder()
                        .setColor(0x9146FF)
                        .setTitle(`🔴 ${streamer.toUpperCase()} IS NOW LIVE ON TWITCH!`)
                        .setURL(`https://twitch.tv/${streamer}`)
                        .setDescription(`**${streamer}** has started streaming on Twitch!\n\n` +
                            `🎮 **Category:** Syndicate Gaming\n` +
                            `📢 **Title:** Ultimate Syndicate Live Stream\n\n` +
                            `*Click the link above to join the stream!*`)
                        .setImage(`https://static-cdn.jtvnw.net/previews-ttv/live_user_${streamer}-1920x1080.jpg`)
                        .setFooter({ text: 'Syndicate Automated Twitch Alert System' })
                        .setTimestamp();

                    await targetChannel.send({
                        content: `Hey @everyone! **${streamer}** is live right now! 🚀`,
                        embeds: [liveEmbed]
                    });

                    liveCache.set(streamer, true);
                } else if (!isCurrentlyLive && wasLive) {
                    // Streamer went offline, reset cache state
                    liveCache.set(streamer, false);
                }
            }
        }
    } catch (error) {
        console.error('[Twitch Monitor] Error checking streams:', error);
    }
}

// Replace with your actual Discord Bot Token
client.login('YOUR_DISCORD_BOT_TOKEN');
