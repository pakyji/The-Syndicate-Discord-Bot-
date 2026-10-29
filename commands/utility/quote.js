/**
 * /quote — fetch an inspirational quote.
 * Uses the free ZenQuotes API (no key required).
 */
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');

const QUOTE_API = 'https://zenquotes.io/api/random';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('quote')
        .setDescription('Get an inspirational quote')
        .addStringOption(option =>
            option.setName('category')
                .setDescription('Quote category')
                .setRequired(false)
                .addChoices(
                    { name: 'Random', value: 'random' },
                    { name: 'Inspirational', value: 'inspirational' },
                    { name: 'Motivational', value: 'motivational' },
                    { name: 'Life', value: 'life' },
                    { name: 'Success', value: 'success' },
                )),

    category: 'Fun',

    async execute(interaction) {
        await interaction.deferReply();

        try {
            const response = await axios.get(QUOTE_API, { timeout: 5000 });
            const data = response.data;

            if (!Array.isArray(data) || !data[0] || !data[0].q || !data[0].a) {
                return interaction.editReply({ content: '❌ Could not fetch a quote. Try again later.' });
            }

            const quote = data[0];

            const embed = new EmbedBuilder()
                .setColor(0x00BFFF)
                .setTitle('💭 Inspirational Quote')
                .setDescription(`"${quote.q}"`)
                .addFields({ name: 'Author', value: quote.a })
                .setFooter({ text: 'Powered by ZenQuotes' })
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('[quote] fetch failed:', error.message);
            return interaction.editReply({ content: '❌ Failed to fetch quote. The API might be down.' });
        }
    },
};