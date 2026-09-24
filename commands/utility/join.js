const { joinVoiceChannel, getVoiceConnection } = require('@discordjs/voice');

module.exports = {
    name: 'join',
    description: 'Make the bot join your voice channel',
    async execute(interaction) {
        // Check if the user is in a voice channel
        const voiceChannel = interaction.member.voice.channel;
        if (!voiceChannel) {
            return interaction.reply({ content: '❌ You need to be in a voice channel first!', ephemeral: true });
        }

        // Check if the bot is already connected in this server
        let connection = getVoiceConnection(interaction.guild.id);
        if (connection) {
            return interaction.reply({ content: '⚠️ I am already connected to a voice channel in this server!', ephemeral: true });
        }

        try {
            // Connect to the user's voice channel
            connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: interaction.guild.id,
                adapterCreator: interaction.guild.voiceAdapterCreator,
            });

            return interaction.reply({ content: `✅ Joined your voice channel: **${voiceChannel.name}**`, ephemeral: true });
        } catch (error) {
            console.error('Join command error:', error);
            return interaction.reply({ content: '❌ Failed to join the voice channel.', ephemeral: true });
        }
    },
};
