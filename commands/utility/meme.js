/**
 * /meme — fetch a random meme.
 * Uses the free Meme API (no key required).
 */
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');

const MEME_API = 'https://meme-api.com/gimme';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('meme')
        .setDescription('Get a random meme')
        .addStringOption(option =>
            option.setName('subreddit')
                .setDescription('Subreddit to fetch from (optional)')
                .setRequired(false)
                .setMaxLength(50)),

    category: 'Fun',

    async execute(interaction) {
        await interaction.deferReply();

        const subreddit = interaction.options.getString('subreddit');
        let url = MEME_API;

        if (subreddit) {
            url = `${MEME_API}/${subreddit}`;
        }

        try {
            const response = await axios.get(url, { timeout: 5000 });
            const data = response.data;

            if (!data.url || !data.title) {
                return interaction.editReply({ content: '❌ Could not fetch a meme. Try again later.' });
            }

            const embed = new EmbedBuilder()
                .setColor(0xFF4500)
                .setTitle(data.title.slice(0, 256))
                .setURL(data.postLink)
                .setImage(data.url)
                .setFooter({ text: `r/${data.subreddit} • 👍 ${data.ups.toLocaleString()}` })
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('[meme] fetch failed:', error.message);
            if (error.response?.status === 404) {
                return interaction.editReply({ content: `❌ Subreddit "${subreddit}" not found or no memes available.` });
            }
            return interaction.editReply({ content: '❌ Failed to fetch meme. The API might be down.' });
        }
    },
};