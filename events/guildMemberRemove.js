const { EmbedBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');

async function updateOrCreateServerStats(guild) {
    let statsChannel = guild.channels.cache.find(c => c.name.startsWith('📊 Members:'));
    
    if (!statsChannel) {
        try {
            statsChannel = await guild.channels.create({
                name: `📊 Members: ${guild.memberCount}`,
                type: ChannelType.GuildVoice,
                position: 0,
                permissionOverwrites: [
                    {
                        id: guild.id,
                        deny: [PermissionFlagsBits.Connect],
                    },
                ],
            });
        } catch (error) {
            console.error('Failed to create stats channel:', error);
        }
    } else {
        await statsChannel.setName(`📊 Members: ${guild.memberCount}`).catch(() => {});
        await statsChannel.setPosition(0).catch(() => {});
    }
}

module.exports = {
    name: 'guildMemberRemove',
    async execute(member) {
        try {
            // 1. Update Server Stats Counter at the Top when someone leaves
            await updateOrCreateServerStats(member.guild);

            // 2. Send Goodbye Message (Channel ID: 901709744421629972)
            const goodbyeChannelId = '901709744421629972'; 
            const channel = member.guild.channels.cache.get(goodbyeChannelId);
            
            if (!channel) return;

            const embed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('🚪 Member Left')
                .setDescription(`**${member.user.tag}** has left the server. Goodbye!`)
                .setTimestamp();

            await channel.send({ embeds: [embed] }).catch(console.error);
        } catch (error) {
            console.error('GuildMemberRemove error:', error);
        }
    },
};
