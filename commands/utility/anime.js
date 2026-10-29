/**
 * /anime — search for anime info.
 * Uses the free Jikan API v4 (no key required, rate limited to 3 req/s).
 */
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const axios = require('axios');

const JIKAN_API = 'https://api.jikan.moe/v4';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('anime')
        .setDescription('Search for anime information')
        .addStringOption(option =>
            option.setName('query')
                .setDescription('Anime name to search')
                .setRequired(true)
                .setMinLength(2)
                .setMaxLength(100)),

    category: 'Fun',

    async execute(interaction) {
        await interaction.deferReply();

        const query = interaction.options.getString('query', true);

        try {
            const response = await axios.get(`${JIKAN_API}/anime`, {
                params: { q: query, limit: 5, sfw: true },
                timeout: 8000,
            });

            const data = response.data;

            if (!data.data || !data.data.length) {
                return interaction.editReply({ content: `❌ No anime found for "${query}".` });
            }

            const anime = data.data[0];

            const embed = new EmbedBuilder()
                .setColor(0xFF69B4)
                .setTitle(anime.title)
                .setURL(anime.url)
                .setDescription(anime.synopsis ? anime.synopsis.slice(0, 300) + '...' : 'No synopsis available.')
                .addFields(
                    { name: 'Type', value: anime.type || 'Unknown', inline: true },
                    { name: 'Episodes', value: anime.episodes?.toString() || 'Unknown', inline: true },
                    { name: 'Status', value: anime.status || 'Unknown', inline: true },
                    { name: 'Score', value: anime.score?.toString() || 'N/A', inline: true },
                    { name: 'Rating', value: anime.rating || 'N/A', inline: true },
                    { name: 'Aired', value: anime.aired?.string || 'Unknown', inline: true },
                )
                .setThumbnail(anime.images?.jpg?.image_url || anime.images?.webp?.image_url || null)
                .setFooter({ text: 'Data from Jikan.moe (MyAnimeList)' })
                .setTimestamp();

            if (anime.trailer?.url) {
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setLabel('Watch Trailer')
                        .setStyle(ButtonStyle.Link)
                        .setURL(anime.trailer.url),
                );
                return interaction.editReply({ embeds: [embed], components: [row] });
            }

            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('[anime] fetch failed:', error.message);
            if (error.response?.status === 429) {
                return interaction.editReply({ content: '⏳ Rate limited. Please wait a moment and try again.' });
            }
            return interaction.editReply({ content: '❌ Failed to fetch anime info. The API might be down.' });
        }
    },
};