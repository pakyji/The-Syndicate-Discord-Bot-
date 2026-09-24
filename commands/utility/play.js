const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, demuxProbe } = require('@discordjs/voice');
const play = require('play-dl');

// OPTIONAL: If you want to bypass YouTube's "Sign in" block, export your cookies from a browser 
// using a browser extension (like "Get cookies.txt LOCALLY") and paste the contents into your .env file as YOUTUBE_COOKIE="your_cookie_string"
if (process.env.YOUTUBE_COOKIE) {
    play.setToken({
        youtube: {
            cookie: process.env.YOUTUBE_COOKIE
        }
    });
}

async function playSong(client, guildId, song) {
    const serverQueue = client.musicQueues.get(guildId);
    if (!serverQueue || !song) return;

    try {
        let streamSource = song.url;
        
        if (!song.url.startsWith('http')) {
            const searched = await play.search(song.url, { limit: 1 });
            if (searched && searched.length > 0) {
                streamSource = searched[0].url;
            } else {
                serverQueue.textChannel.send('❌ No results found for your query.').catch(() => {});
                serverQueue.songs.shift();
                return playSong(client, guildId, serverQueue.songs[0]);
            }
        }

        const sourceStream = await play.stream(streamSource);
        const { stream, type } = await demuxProbe(sourceStream.stream);

        const resource = createAudioResource(stream, { 
            inputType: type,
            inlineVolume: true 
        });
        
        resource.volume.setVolume(1.0);
        serverQueue.player.play(resource);

        serverQueue.textChannel.send(`🎶 Now playing: **${song.title}**`).catch(() => {});
    } catch (error) {
        console.error('Playback stream error:', error);
        serverQueue.textChannel.send(`❌ Error: YouTube blocked the request. Try adding your YouTube cookie to your .env file.`).catch(() => {});
        serverQueue.songs.shift();
        playSong(client, guildId, serverQueue.songs[0]);
    }
}

module.exports = {
    name: 'play',
    description: 'Play music from YouTube or search query',
    options: [{
        name: 'song',
        type: 3,
        description: 'The song name or URL',
        required: true
    }],
    async execute(interaction) {
        const voiceChannel = interaction.member.voice.channel;
        if (!voiceChannel) {
            return interaction.reply({ content: '❌ You need to be in a voice channel to play music!', ephemeral: true });
        }

        const songQuery = interaction.options.getString('song');
        await interaction.deferReply();

        let serverQueue = interaction.client.musicQueues.get(interaction.guild.id);
        
        if (!serverQueue) {
            const connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: interaction.guild.id,
                adapterCreator: interaction.guild.voiceAdapterCreator,
            });
            const player = createAudioPlayer();
            serverQueue = { textChannel: interaction.channel, voiceChannel, connection, player, songs: [] };
            interaction.client.musicQueues.set(interaction.guild.id, serverQueue);
            connection.subscribe(player);

            player.on(AudioPlayerStatus.Idle, () => {
                serverQueue.songs.shift();
                playSong(interaction.client, interaction.guild.id, serverQueue.songs[0]);
            });

            player.on('error', error => {
                console.error('Audio player error:', error);
                serverQueue.songs.shift();
                playSong(interaction.client, interaction.guild.id, serverQueue.songs[0]);
            });
        }

        serverQueue.songs.push({ title: songQuery, url: songQuery });
        if (serverQueue.songs.length === 1) {
            await interaction.editReply(`🎵 Loading song...`);
            playSong(interaction.client, interaction.guild.id, serverQueue.songs[0]);
        } else {
            await interaction.editReply(`📥 Added to queue: **${songQuery}**`);
        }
    },
};
