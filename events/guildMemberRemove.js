const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'guildMemberRemove',
    async execute(member) {
        const goodbyeChannelId = '901709744421629972'; 
        const channel = member.guild.channels.cache.get(goodbyeChannelId);
        
        if (!channel) return;

        const embed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('🚪 Member Left')
            .setDescription(`**${member.user.tag}** has left the server. Goodbye!`)
            .setTimestamp();

        channel.send({ embeds: [embed] }).catch(console.error);
    },
};
