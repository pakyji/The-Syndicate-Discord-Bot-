/**
 * /serverinfo — display rich information about a Discord server.
 */
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('serverinfo')
        .setDescription('Show information about this server'),

    category: 'General',

    async execute(interaction) {
        const guild = interaction.guild;
        if (!guild) {
            return interaction.reply({ content: '❌ This command can only be used in a server.', ephemeral: true });
        }

        const memberCount = guild.memberCount;
        const roles = [...guild.roles.cache.values()].filter(r => r.members.size > 0).sort((a,b) => b.position - a.position).slice(0, 20);
        const textChannels = guild.channels.cache.filter(c => c.type === 0).size;
        const voiceChannels = guild.channels.cache.filter(c => c.type === 2).size;
        const categories = guild.channels.cache.filter(c => c.type === 4).size;

        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle(guild.name)
            .setDescription(guild.description || 'No server description set.')
            .setThumbnail(guild.iconURL() || undefined)
            .addFields(
                { name: 'Members', value: `${memberCount} (${guild.members.cache.filter(m => !m.user.bot).size} humans)`, inline: true },
                { name: 'Roles', value: `${guild.roles.cache.size} total (${roles.length} with members)`, inline: true },
                { name: 'Channels', value: `${guild.channels.cache.size} total (${textChannels} text, ${voiceChannels} voice, ${categories} categories)`, inline: true },
                { name: 'Created', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`, inline: true },
                { name: 'Server ID', value: `\`${guild.id}\``, inline: false },
            )
            .setTimestamp({ epochTimestamp: guild.createdTimestamp });

        if (roles.length) {
            const roleLines = roles.map(r => `${r.name} (${r.members.size})`).slice(0, 10);
            embed.addFields({ name: 'Top Roles', value: roleLines.join('\n'), inline: false });
        }

        return interaction.reply({ embeds: [embed] });
    },
};