const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'messageCreate',
    async execute(message, client) {
        // Ignore bot messages and direct messages
        if (message.author.bot || !message.guild) return;

        // Regex for Spotify, TikTok, and YouTube links
        const spotifyRegex = /https:\/\/open\.spotify\.com\/(track|album|playlist|artist)\/([a-zA-Z0-9]+)(\?si=[a-zA-Z0-9_-]+)?/i;
        const tiktokRegex = /https?:\/\/(www\.)?(tiktok\.com\/@[\w.-]+\/video\/[0-9]+|vm\.tiktok\.com\/[a-zA-Z0-9]+)/i;
        const youtubeRegex = /https?:\/\/(www\.)?(youtube\.com\/(watch\?v=|shorts\/)[a-zA-Z0-9_-]+|youtu\.be\/[a-zA-Z0-9_-]+)/i;

        const content = message.content;

        try {
            if (spotifyRegex.test(content)) {
                await message.delete().catch(() => {});
                const match = content.match(spotifyRegex);
                const embed = new EmbedBuilder()
                    .setColor(0x1DB954)
                    .setTitle('🎵 Spotify Link')
                    .setDescription(`**Shared by:** <@${message.author.id}>\n\n🔗 [Click here to listen](${match[0]})`)
                    .setFooter({ text: 'Spotify Media Share', iconURL: 'https://upload.wikimedia.org/wikipedia/commons/1/19/Spotify_logo_without_text.svg' })
                    .setTimestamp();
                await message.channel.send({ embeds: [embed] });

            } else if (tiktokRegex.test(content)) {
                await message.delete().catch(() => {});
                const match = content.match(tiktokRegex);
                const embed = new EmbedBuilder()
                    .setColor(0x000000)
                    .setTitle('📱 TikTok Video')
                    .setDescription(`**Shared by:** <@${message.author.id}>\n\n🔗 [Click here to watch on TikTok](${match[0]})`)
                    .setTimestamp();
                await message.channel.send({ embeds: [embed] });

            } else if (youtubeRegex.test(content)) {
                await message.delete().catch(() => {});
                const match = content.match(youtubeRegex);
                const embed = new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setTitle('🎬 YouTube Video')
                    .setDescription(`**Shared by:** <@${message.author.id}>\n\n🔗 [Click here to watch on YouTube](${match[0]})`)
                    .setTimestamp();
                await message.channel.send({ embeds: [embed] });
            }
        } catch (error) {
            console.error('Media link handler error:', error);
        }
    },
};
