const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'messageCreate',
    async execute(message, client) {
        // Ignore bot messages and direct messages
        if (message.author.bot || !message.guild) return;

        // Regex to match Spotify track, album, playlist, or artist links
        const spotifyRegex = /https:\/\/open\.spotify\.com\/(track|album|playlist|artist)\/([a-zA-Z0-9]+)(\?si=[a-zA-Z0-9_-]+)?/i;
        
        const match = message.content.match(spotifyRegex);

        if (match) {
            const spotifyUrl = match[0];

            try {
                // Optional: Delete the original text link to keep chat clean
                // await message.delete().catch(() => {});

                // Create a professional Spotify embed card
                const spotifyEmbed = new EmbedBuilder()
                    .setColor(0x1DB954) // Official Spotify Green color
                    .setTitle('🎵 Spotify Link Detected')
                    .setDescription(`**Shared by:** <@${message.author.id}>\n\n🔗 [Click here to listen on Spotify](${spotifyUrl})`)
                    .setFooter({ 
                        text: 'Spotify Media Share', 
                        iconURL: 'https://upload.wikimedia.org/wikipedia/commons/1/19/Spotify_logo_without_text.svg' 
                    })
                    .setTimestamp();

                // Send the rich embed to the channel
                await message.channel.send({ embeds: [spotifyEmbed] });

            } catch (error) {
                console.error('Spotify link handler error:', error);
            }
        }
    },
};
