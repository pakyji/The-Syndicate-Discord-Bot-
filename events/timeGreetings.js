const cron = require('node-cron');
const { EmbedBuilder } = require('discord.js');

// English messages ki list
const englishMessages = {
    morning: [
        "Good morning everyone! Ready for today's grinding and heists? ☕🎮",
        "Rise and shine, Syndicate! Let's make some serious cash today. ☀️💸",
        "Morning! Time to log in and conquer Los Santos. Let's get it! 🔥"
    ],
    afternoon: [
        "Good afternoon team! Who's online and ready for some action? 🚗💨",
        "Afternoon grind time! Drop a message if you need crew members today. 🎯",
        "Hope your day is going great! Time to jump into the server and chill. 😎"
    ],
    night: [
        "Good night everyone! Rest well and get ready for tomorrow's chaos. 🌙💤",
        "Night time is the right time to log off. Sweet dreams, gamers! 🌌",
        "Wrapping up the day! Sleep tight and see you all tomorrow. 🛡️"
    ]
};

// Italian messages ki list
const italianMessages = {
    morning: [
        "Buongiorno raga! Che la giornata vi porti fortune in GTA e non solo! 🚀",
        "Buongiorno Syndicate! Pronti a fare due colpi oggi? ☕",
        "Sveglia raga! Los Santos ci aspetta per un'altra giornata di fuoco! 🔥"
    ],
    afternoon: [
        "Buon pomeriggio! Pomeriggio perfetto per un bel Cayo Perico o Casino Heist. 🕶️",
        "Buon pomeriggio a tutti! Chi è online per giocare insieme? 🚗💨",
        "Pomeriggio di grind! Fatevi sentire se cercate crew per le attività! 🎯"
    ],
    night: [
        "Buonanotte Syndicate! Chiudiamo baracca per oggi, ci si becca domani! ✨",
        "Buonanotte a tutti i gamer! Riposatevi bene per le missioni di domani. 💤",
        "Notte raga! Stacca tutto e sogni d'oro. 🌌"
    ]
};

// Random message picker function
function getRandomMessage(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

module.exports = {
    name: 'ready',
    once: true,
    execute(client) {
        console.log('🕒 Multi-language Dynamic Time Greetings system is active!');

        const englishChannelId = '1552721386244407357';
        const italianChannelId = '1537221793922940928';

        async function sendGreeting(channelId, title, messageList, color) {
            const channel = client.channels.cache.get(channelId);
            if (!channel) return;

            const randomText = getRandomMessage(messageList);
            const embed = new EmbedBuilder()
                .setColor(color)
                .setTitle(title)
                .setDescription(randomText)
                .setTimestamp();

            await channel.send({ embeds: [embed] }).catch(err => console.error(`Error sending message to ${channelId}:`, err));
        }

        // 🌅 MORNING (08:00 AM)
        cron.schedule('0 8 * * *', () => {
            // English Channel
            sendGreeting(englishChannelId, '🌅 Good Morning!', englishMessages.morning, '#FFD700');
            // Italian Channel
            sendGreeting(italianChannelId, '🌅 Buongiorno!', italianMessages.morning, '#FFD700');
        }, { timezone: 'Europe/Rome' });

        // ☀️ AFTERNOON (02:00 PM / 14:00)
        cron.schedule('0 14 * * *', () => {
            // English Channel
            sendGreeting(englishChannelId, '☀️ Good Afternoon!', englishMessages.afternoon, '#FF8C00');
            // Italian Channel
            sendGreeting(italianChannelId, '☀️ Buon Pomeriggio!', italianMessages.afternoon, '#FF8C00');
        }, { timezone: 'Europe/Rome' });

        // 🌙 NIGHT (12:00 AM / 00:00)
        cron.schedule('0 0 * * *', () => {
            // English Channel
            sendGreeting(englishChannelId, '🌙 Good Night!', englishMessages.night, '#4B0082');
            // Italian Channel
            sendGreeting(italianChannelId, '🌙 Buonanotte!', italianMessages.night, '#4B0082');
        }, { timezone: 'Europe/Rome' });
    },
};                                          
