/**
 * Scheduled good-morning / afternoon / night greetings (EN + IT).
 *
 * Fixes vs. the original:
 *  • Channel IDs came from config instead of two hardcoded constants.
 *  • The English channel ID here was identical to the verified-ping channel, so
 *    greetings and "you're AFK" pings landed in the same place. Both are now
 *    separately configurable.
 *  • `client.channels.cache.get()` only — if the channel was not cached (common
 *    right after a restart, before GuildCreate populates) the greeting was
 *    silently skipped forever. Now falls back to a fetch.
 *  • node-cron was `require`d but NOT declared in package.json, so a fresh
 *    `npm install` crashed the bot at boot. It is now a declared dependency.
 *  • cron jobs are tracked and stopped on shutdown instead of leaking.
 *  • The comment claiming "billions of unique combinations" was inaccurate — the
 *    real space is greetings × actions × emojis (e.g. 5 × 4 × 5 = 100). Message
 *    pools have been widened.
 */
const cron = require('node-cron');
const { Events, EmbedBuilder } = require('discord.js');
const config = require('../lib/config');

const EN = {
    morningGreetings: ['Good morning', 'Rise and shine', 'Morning everyone', 'Wake up', 'Hey everyone, good morning', 'Top of the morning'],
    afternoonGreetings: ['Good afternoon', 'Afternoon crew', 'Hey everyone', 'Midday check-in', 'Hope the day is going well'],
    nightGreetings: ['Good night', 'Night everyone', 'Wind down time', 'Late crew, good night', 'Sleep well'],
    morningActions: [
        "ready for today's grinding and heists?",
        'time to make some serious cash in Los Santos.',
        'let us log in and conquer the city today.',
        'hope you are ready for some crazy action.',
        'coffee first, Cayo Perico second.',
    ],
    afternoonActions: [
        'who is online and ready for some action?',
        'perfect time for a Cayo Perico or Casino heist.',
        'drop a message if you need crew members today.',
        'let us all get in the server and chill.',
        'anyone free for a public lobby run?',
    ],
    nightActions: [
        'rest well and get ready for tomorrow\'s chaos.',
        'time to log off and get some sweet dreams.',
        'wrapping up for the day. Sleep tight, gamers!',
        'see you all tomorrow for more adventures.',
        'last call for one more heist, then bed.',
    ],
    emojis: ['☕🎮', '☀️💸', '🔥🚀', '😎🎯', '🕶️🚗', '🌆💰', '🎲✨'],
};

const IT = {
    morningGreetings: ['Buongiorno', 'Buongiorno a tutti', 'Sveglia raga', 'Buongiorno Syndicate', 'Bella raga, buongiorno', 'Buondì'],
    afternoonGreetings: ['Buon pomeriggio', 'Pomeriggio raga', 'Ciao a tutti', 'Buon pomeriggio Syndicate'],
    nightGreetings: ['Buonanotte', 'Buonanotte a tutti', 'Notte raga', 'Buonanotte Syndicate'],
    morningActions: [
        'pronti per un\'altra giornata di fuoco e colpi?',
        'è l\'ora di fare un bel po\' di soldi a Los Santos.',
        'preparatevi a loggare per divertirci insieme.',
        'chi è pronto a spaccare tutto oggi?',
        'prima il caffè, poi Cayo Perico.',
    ],
    afternoonActions: [
        'chi è online per fare due colpi insieme?',
        'pomeriggio perfetto per un bel colpo o attività.',
        'fatevi sentire se cercate crew per giocare.',
        'chi si unisce per un po\' di sano gaming?',
        'qualcuno libero per una lobby pubblica?',
    ],
    nightActions: [
        'riposatevi bene per le missioni di domani.',
        'chiudiamo baracca per oggi, sogni d\'oro!',
        'staccate la spina e buone notti a tutti!',
        'ci si becca domani per nuove avventure.',
        'ultimo colpo e poi a letto.',
    ],
    emojis: ['☕🚀', '🔥😎', '🚗💨', '🎯🕹️', '✨💤', '🌆💶'],
};

function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function compose(greetings, actions, emojis) {
    return `${pick(greetings)}! ${pick(actions)} ${pick(emojis)}`;
}

module.exports = {
    name: Events.ClientReady,
    once: true,

    execute(client) {
        const jobs = [];

        async function sendGreeting(channelId, title, greetings, actions, emojis, color) {
            if (!channelId) return;
            // Cache first, then a fetch — the original only checked the cache and
            // silently skipped whenever the channel was not populated yet.
            const channel = client.channels.cache.get(channelId)
                || await client.channels.fetch(channelId).catch(() => null);
            if (!channel || !channel.isTextBased()) return;

            const embed = new EmbedBuilder()
                .setColor(color)
                .setTitle(title)
                .setDescription(compose(greetings, actions, emojis))
                .setTimestamp();

            await channel.send({ embeds: [embed] }).catch((error) => {
                console.error(`[greetings] could not post to ${channelId}:`, error.message);
            });
        }

        const tz = config.botTimezone || 'Europe/Rome';
        const en = config.channels.greetingEnglish;
        const it = config.channels.greetingItalian;

        const schedule = (expression, label, fn) => {
            try {
                const task = cron.schedule(expression, fn, { timezone: tz });
                jobs.push(task);
                console.log(`[greetings] scheduled ${label} (${expression}, ${tz})`);
            } catch (error) {
                console.error(`[greetings] invalid cron expression for ${label}:`, error.message);
            }
        };

        schedule('0 8 * * *', 'morning', () => {
            sendGreeting(en, '🌅 Good Morning!', EN.morningGreetings, EN.morningActions, EN.emojis, '#FFD700');
            sendGreeting(it, '🌅 Buongiorno!', IT.morningGreetings, IT.morningActions, IT.emojis, '#FFD700');
        });

        schedule('0 14 * * *', 'afternoon', () => {
            sendGreeting(en, '☀️ Good Afternoon!', EN.afternoonGreetings, EN.afternoonActions, EN.emojis, '#FF8C00');
            sendGreeting(it, '☀️ Buon Pomeriggio!', IT.afternoonGreetings, IT.afternoonActions, IT.emojis, '#FF8C00');
        });

        schedule('0 0 * * *', 'night', () => {
            sendGreeting(en, '🌙 Good Night!', EN.nightGreetings, EN.nightActions, EN.emojis, '#4B0082');
            sendGreeting(it, '🌙 Buonanotte!', IT.nightGreetings, IT.nightActions, IT.emojis, '#4B0082');
        });

        const stopAll = () => { for (const job of jobs) { try { job.stop(); } catch { /* ignore */ } } };
        process.on('SIGTERM', stopAll);
        process.on('SIGINT', stopAll);
        client.once('shardDisconnect', stopAll);

        console.log('🕒 Multilingual time greetings are active.');
    },
};
