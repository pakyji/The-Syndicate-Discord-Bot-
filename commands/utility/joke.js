/**
 * /joke — fetch a random joke.
 * Uses the free Official Joke API (no key required).
 */
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');

const JOKE_API = 'https://official-joke-api.appspot.com/random_joke';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('joke')
        .setDescription('Get a random joke')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Type of joke')
                .setRequired(false)
                .addChoices(
                    { name: 'Random', value: 'random' },
                    { name: 'Programming', value: 'programming' },
                    { name: 'General', value: 'general' },
                    { name: 'Knock-knock', value: 'knock-knock' },
                )),

    category: 'Fun',

    async execute(interaction) {
        await interaction.deferReply();

        const type = interaction.options.getString('type') || 'random';
        let url = JOKE_API;

        if (type !== 'random') {
            url = `https://official-joke-api.appspot.com/jokes/${type}/random`;
        }

        try {
            const response = await axios.get(url, { timeout: 5000 });
            const data = response.data;

            const jokes = Array.isArray(data) ? data : [data];
            const joke = jokes[0];

            if (!joke || !joke.setup || !joke.punchline) {
                return interaction.editReply({ content: '❌ Could not fetch a joke. Try again later.' });
            }

            const embed = new EmbedBuilder()
                .setColor(0xFFD700)
                .setTitle('😂 Random Joke')
                .addFields(
                    { name: 'Setup', value: joke.setup },
                    { name: 'Punchline', value: `||${joke.punchline}||` },
                )
                .setFooter({ text: `Type: ${type}` })
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('[joke] fetch failed:', error.message);
            return interaction.editReply({ content: '❌ Failed to fetch joke. The API might be down.' });
        }
    },
};