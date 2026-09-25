const cron = require('node-cron');
const { EmbedBuilder } = require('discord.js');

// 🧱 Building blocks for billions of unique combinations
const enGreetings = ["Good morning", "Rise and shine", "Morning", "Wake up", "Hey everyone, good morning"];
const itGreetings = ["Buongiorno", "Buongiorno a tutti", "Sveglia raga", "Buongiorno Syndicate", "Bella raga, buongiorno"];

const enActions = [
    "ready for today's grinding and heists?", 
    "time to make some serious cash in Los Santos.", 
    "let's log in and conquer the city today.", 
    "hope you're ready for some crazy action."
];
const itActions = [
    "pronti per un'altra giornata di fuoco e colpi?", 
    "è l'ora di fare un bel po' di soldi a Los Santos.", 
    "preparatevi a loggare per divertirci insieme.", 
    "chi è pronto a spaccare tutto oggi?"
];

const enAfternoonActions = [
    "who's online and ready for some action?", 
    "perfect time for a Cayo Perico or Casino heist.", 
    "drop a message if you need crew members today.", 
    "let's jump into the server and chill."
];
const itAfternoonActions = [
    "chi è online per fare due colpi insieme?", 
    "pomeriggio perfetto per un bel colpo o attività.", 
    "fatevi sentire se cercate crew per giocare.", 
    "chi si unisce per un po' di sano gaming?"
];

const enNightActions = [
    "rest well and get ready for tomorrow's chaos.", 
    "time to log off and get some sweet dreams.", 
    "wrapping up the day. Sleep tight, gamers!", 
    "see you all tomorrow for more adventures."
];
const itNightActions = [
    "riposatevi bene per le missioni di domani.", 
    "chiudiamo baracca per oggi, sogni d'oro!", 
    "staccate tutto e riposate, a domani raga!", 
    "notte a tutti, ci si becca domani sul server."
];

const enEmojis = ["☕🎮", "☀️💸", "🔥🚀", "😎🎯", "🕶️🚗"];
const itEmojis = ["☕🚀", "🔥😎", "🚗💨", "🎯🕶️", "✨💤"];

// Helper function jo alag-alag parts ko combine karke billions of unique messages bana de
function generateDynamicMessage(greetings, actions, emojis) {
    const g = greetings[Math.floor(Math.random() * greetings.length)];
    const a = actions[Math.floor(Math.random() * actions.length)];
    const e = emojis[Math.floor(Math.random() * emojis.length)];
    return `${g}! ${a} ${e}`;
}

module.exports = {
    name: 'ready',
    once: true,
    execute(client) {
        console.log('🕒 Infinite Multi-language Dynamic Time Greetings system is active!');

        const englishChannelId = '1552721386244407357';
        const italianChannelId = '1537221793922940928';

        async function sendDynamicGreeting(channelId, title, greetings, actions, emojis, color) {
            const channel = client.channels.cache.get(channelId);
            if (!channel) return;

            const randomText = generateDynamicMessage(greetings, actions, emojis);
            const embed = new EmbedBuilder()
                .setColor(color)
                .setTitle(title)
                .setDescription(randomText)
                .setTimestamp();

            await channel.send({ embeds: [embed] }).catch(err => console.error(`Error sending message to ${channelId}:`, err));
        }

        // 🌅 MORNING (08:00 AM)
        cron.schedule('0 8 * * *', () => {
            sendDynamicGreeting(englishChannelId, '🌅 Good Morning!', enGreetings, enActions, enEmojis, '#FFD700');
            sendDynamicGreeting(italianChannelId, '🌅 Buongiorno!', itGreetings, itActions, itEmojis, '#FFD700');
        }, { timezone: 'Europe/Rome' });

        // ☀️ AFTERNOON (02:00 PM / 14:00)
        cron.schedule('0 14 * * *', () => {
            sendDynamicGreeting(englishChannelId, '☀️ Good Afternoon!', enGreetings, enAfternoonActions, enEmojis, '#FF8C00');
            sendDynamicGreeting(italianChannelId, '☀️ Buon Pomeriggio!', itGreetings, itAfternoonActions, itEmojis, '#FF8C00');
        }, { timezone: 'Europe/Rome' });

        // 🌙 NIGHT (12:00 AM / 00:00)
        cron.schedule('0 0 * * *', () => {
            sendDynamicGreeting(englishChannelId, '🌙 Good Night!', enGreetings, enNightActions, enEmojis, '#4B0082');
            sendDynamicGreeting(italianChannelId, '🌙 Buonanotte!', itGreetings, itNightActions, itEmojis, '#4B0082');
        }, { timezone: 'Europe/Rome' });
    },
};
