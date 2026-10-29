/**
 * /dog — fetch a random dog picture.
 * Uses the free Dog API (no key required).
 */
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');

const DOG_API = 'https://dog.ceo/api/breeds/image/random';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('dog')
        .setDescription('Get a random dog picture')
        .addStringOption(option =>
            option.setName('breed')
                .setDescription('Specific breed (optional)')
                .setRequired(false)
                .setMaxLength(50)),

    category: 'Fun',

    async execute(interaction) {
        await interaction.deferReply();

        const breed = interaction.options.getString('breed');
        let url = DOG_API;

        if (breed) {
            url = `https://dog.ceo/api/breed/${breed.toLowerCase()}/images/random`;
        }

        try {
            const response = await axios.get(url, { timeout: 5000 });
            const data = response.data;

            if (data.status !== 'success' || !data.message) {
                return interaction.editReply({ content: breed ? `❌ Breed "${breed}" not found.` : '❌ Could not fetch a dog picture. Try again later.' });
            }

            const embed = new EmbedBuilder()
                .setColor(0x8B4513)
                .setTitle(breed ? `🐕 Random ${breed.charAt(0).toUpperCase() + breed.slice(1)}` : '🐕 Random Dog')
                .setImage(data.message)
                .setFooter({ text: 'Powered by Dog CEO API' })
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('[dog] fetch failed:', error.message);
            if (error.response?.status === 404) {
                return interaction.editReply({ content: `❌ Breed "${breed}" not found.` });
            }
            return interaction.editReply({ content: '❌ Failed to fetch dog. The API might be down.' });
        }
    },
};