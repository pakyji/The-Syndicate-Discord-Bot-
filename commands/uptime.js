/**
 * /uptime — show bot uptime and stats.
 */
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../lib/config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('uptime')
        .setDescription('Show bot uptime and statistics'),

    category: 'General',

    async execute(interaction) {
        const client = interaction.client;
        const uptimeMs = client.uptime || (Date.now() - config.startedAt);
        const uptimeSec = Math.floor(uptimeMs / 1000);

        const days = Math.floor(uptimeSec / 86400);
        const hours = Math.floor((uptimeSec % 86400) / 3600);
        const minutes = Math.floor((uptimeSec % 3600) / 60);
        const seconds = uptimeSec % 60;

        const uptimeStr = `${days}d ${hours}h ${minutes}m ${seconds}s`;

        const memory = process.memoryUsage();
        const memStr = `${(memory.heapUsed / 1024 / 1024).toFixed(2)} MB / ${(memory.heapTotal / 1024 / 1024).toFixed(2)} MB`;

        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle('🤖 Bot Uptime & Stats')
            .addFields(
                { name: 'Uptime', value: `\`${uptimeStr}\``, inline: true },
                { name: 'Memory', value: `\`${memStr}\``, inline: true },
                { name: 'Node', value: `\`${process.version}\``, inline: true },
                { name: 'Guilds', value: `\`${client.guilds.cache.size}\``, inline: true },
                { name: 'Users', value: `\`${client.users.cache.size}\``, inline: true },
                { name: 'Channels', value: `\`${client.channels.cache.size}\``, inline: true },
                { name: 'Commands', value: `\`${client.commands.size}\``, inline: true },
                { name: 'Started', value: `<t:${Math.floor(config.startedAt / 1000)}:R>`, inline: true },
            )
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    },
};