/**
 * /cat — fetch a random cat picture.
 * Uses the free Cat API (no key required for basic usage).
 */
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');

const CAT_API = 'https://api.thecatapi.com/v1/images/search';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('cat')
        .setDescription('Get a random cat picture')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Image format')
                .setRequired(false)
                .addChoices(
                    { name: 'Image', value: 'image' },
                    { name: 'GIF', value: 'gif' },
                )),

    category: 'Fun',

    async execute(interaction) {
        await interaction.deferReply();

        const type = interaction.options.getString('type') || 'image';
        const mimeType = type === 'gif' ? 'gif' : 'jpg,png';

        try {
            const response = await axios.get(CAT_API, {
                params: { mime_types: mimeType, limit: 1 },
                timeout: 5000,
            });

            const data = response.data;

            if (!Array.isArray(data) || !data[0] || !data[0].url) {
                return interaction.editReply({ content: '❌ Could not fetch a cat picture. Try again later.' });
            }

            const cat = data[0];

            const embed = new EmbedBuilder()
                .setColor(0xFF69B4)
                .setTitle('🐱 Random Cat')
                .setImage(cat.url)
                .setFooter({ text: 'Powered by TheCatAPI' })
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('[cat] fetch failed:', error.message);
            return interaction.editReply({ content: '❌ Failed to fetch cat. The API might be down.' });
        }
    },
};