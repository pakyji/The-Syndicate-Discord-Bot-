const { Events } = require('discord.js');

module.exports = {
    name: Events.ClientReady,
    once: true,
    execute(client) {
        const TARGET_CHANNEL_ID = '1552721386244407357'; // Your target channel ID
        const VERIFIED_ROLE_NAME = 'Verified';
        
        // List of funny messages
        const funnyMessages = [
            "Hey {USERS}, what are you all sneaking around here for? Come say hi!",
            "Looks like {USERS} are gaming way too hard today. Someone check on them!",
            "Yo {USERS}! Drink some water, take a break, and step away from the screen!",
            "Where are you guys, {USERS}? Everyone in the server misses you (or maybe your snacks)!",
            "Alert! {USERS} have been AFK for more than 5 minutes without permission!",
            "Bro {USERS}, are you all still alive or did you fall asleep on your keyboards?"
        ];

        // Check every 30 minutes to see if it's time to send a ping based on the active window
        const checkInterval = 30 * 60 * 1000; // 30 minutes
        let lastPingTime = 0;
        const PING_COOLDOWN = 3 * 60 * 60 * 1000; // 3 hours gap between each ping

        setInterval(async () => {
            try {
                // Get current time in Europe timezone (e.g., Central European Time / CET / CEST)
                const now = new Date();
                const europeTimeOptions = { timeZone: 'Europe/Paris', hour: 'numeric', minute: 'numeric', hour12: false };
                const formatter = new Intl.DateTimeFormat([], europeTimeOptions);
                const timeString = formatter.format(now); // e.g., "06:30" or "22:15"
                
                const [currentHour, currentMinute] = timeString.split(':').map(Number);

                // Check if current Europe time is between 06:00 (6 AM) and 23:00 (11 PM)
                const isInActiveWindow = (currentHour > 6 || (currentHour === 6 && currentMinute >= 0)) && 
                                           (currentHour < 23 || (currentHour === 23 && currentMinute === 0));

                if (!isInActiveWindow) {
                    return; // Skip if outside 06:00 - 23:00 Europe time
                }

                // Check if 3 hours have passed since the last ping
                const currentTime = Date.now();
                if (currentTime - lastPingTime < PING_COOLDOWN && lastPingTime !== 0) {
                    return; 
                }

                const guild = client.guilds.cache.first();
                if (!guild) return;

                const channel = await guild.channels.fetch(TARGET_CHANNEL_ID).catch(() => null);
                if (!channel) return;

                // Fetch members to ensure role cache is up to date
                await guild.members.fetch();
                
                const verifiedRole = guild.roles.cache.find(r => r.name === VERIFIED_ROLE_NAME);
                if (!verifiedRole) return;

                const verifiedMembers = verifiedRole.members.map(m => m.user.id);
                if (verifiedMembers.length === 0) return;

                // Pick up to 3 random verified members
                const countToPing = Math.min(3, verifiedMembers.length);
                const selectedUserIds = [];

                while (selectedUserIds.length < countToPing) {
                    const randomId = verifiedMembers[Math.floor(Math.random() * verifiedMembers.length)];
                    if (!selectedUserIds.includes(randomId)) {
                        selectedUserIds.push(randomId);
                    }
                }

                const userMentions = selectedUserIds.map(id => `<@${id}>`).join(', ');
                const randomMsgTemplate = funnyMessages[Math.floor(Math.random() * funnyMessages.length)];
                const finalMessage = randomMsgTemplate.replace('{USERS}', userMentions);

                // Send message and update last ping timestamp
                await channel.send(finalMessage);
                lastPingTime = Date.now();

            } catch (error) {
                console.error('Error in verified ping active-window task:', error);
            }
        }, checkInterval);
    },
};
