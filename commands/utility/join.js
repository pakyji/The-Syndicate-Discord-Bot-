const { joinVoiceChannel } = require('@discordjs/voice');

module.exports = {
    name: 'join',
    description: 'Make the bot join your voice channel',
    async execute(message, args) {
        const voiceChannel = message.member.voice.channel;
        
        if (!voiceChannel) {
            return message.reply('❌ You must be in a voice channel first!');
        }

        try {
            joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: message.guild.id,
                adapterCreator: message.guild.voiceAdapterCreator,
                selfDeaf: true,
            });

            await message.reply(`✅ Joined voice channel: **${voiceChannel.name}**!`);
        } catch (error) {
            console.error('Join error:', error);
            await message.reply('❌ Failed to join the voice channel.');
        }
    }
};
