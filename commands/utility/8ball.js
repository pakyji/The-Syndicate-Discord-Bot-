/**
 * /8ball — Magic 8-ball answers.
 * Pure local logic, no API needed.
 */
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const ANSWERS = [
    // Positive
    { text: 'It is certain.', type: 'positive' },
    { text: 'It is decidedly so.', type: 'positive' },
    { text: 'Without a doubt.', type: 'positive' },
    { text: 'Yes, definitely.', type: 'positive' },
    { text: 'You may rely on it.', type: 'positive' },
    { text: 'As I see it, yes.', type: 'positive' },
    { text: 'Most likely.', type: 'positive' },
    { text: 'Outlook good.', type: 'positive' },
    { text: 'Yes.', type: 'positive' },
    { text: 'Signs point to yes.', type: 'positive' },

    // Neutral
    { text: 'Reply hazy, try again.', type: 'neutral' },
    { text: 'Ask again later.', type: 'neutral' },
    { text: 'Better not tell you now.', type: 'neutral' },
    { text: 'Cannot predict now.', type: 'neutral' },
    { text: 'Concentrate and ask again.', type: 'neutral' },

    // Negative
    { text: "Don't count on it.", type: 'negative' },
    { text: 'My reply is no.', type: 'negative' },
    { text: 'My sources say no.', type: 'negative' },
    { text: 'Outlook not so good.', type: 'negative' },
    { text: 'Very doubtful.', type: 'negative' },
];

const COLORS = {
    positive: 0x00FF00,
    neutral: 0xFFFF00,
    negative: 0xFF0000,
};

const EMOJIS = {
    positive: '✅',
    neutral: '🤔',
    negative: '❌',
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('8ball')
        .setDescription('Ask the magic 8-ball a question')
        .addStringOption(option =>
            option.setName('question')
                .setDescription('Your question')
                .setRequired(true)
                .setMinLength(3)
                .setMaxLength(200)),

    category: 'Fun',

    async execute(interaction) {
        const question = interaction.options.getString('question', true);
        const answer = ANSWERS[Math.floor(Math.random() * ANSWERS.length)];

        const embed = new EmbedBuilder()
            .setColor(COLORS[answer.type])
            .setTitle('🎱 Magic 8-Ball')
            .addFields(
                { name: 'Question', value: question },
                { name: 'Answer', value: `${EMOJIS[answer.type]} ${answer.text}` },
            )
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    },
};