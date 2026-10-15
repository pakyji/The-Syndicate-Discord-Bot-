/**
 * /ping — latency check.
 * Converted from the legacy `{name, execute}` format (which registered with no
 * options and contained two identical branches) to a proper slash command, and
 * now reports real gateway + round-trip latency instead of a flat "Pong!".
 */
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Check bot and API latency'),

    category: 'General',

    async execute(interaction) {
        const sent = await interaction.reply({ content: '🏓 Pinging…', fetchReply: true, ephemeral: true });
        const roundTrip = sent.createdTimestamp - interaction.createdTimestamp;
        const ws = Math.round(interaction.client.ws.ping || 0);

        return interaction.editReply({
            content: `🏓 **Pong!**\n`
                + `• Round-trip: **${roundTrip} ms**\n`
                + `• Gateway: **${ws} ms**\n`
                + `• Uptime: <t:${Math.floor((Date.now() - interaction.client.uptime) / 1000)}:R>`,
        });
    },
};
