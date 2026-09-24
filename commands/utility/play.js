const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, demuxProbe } = require('@discordjs/voice');
const play = require('play-dl');

async function playSong(client, guildId, song) {
    const serverQueue = client.musicQueues.get(guildId);
    if (!serverQueue || !song) return;

    try {
        let streamSource = song.url;
        
        // Risoluzione link Spotify
        if (play.is_spotify(song.url)) {
            const spotifyData = await play.spotify(song.url);
            const searched = await play.search(`${spotifyData.name} ${spotifyData.artists[0]?.name || ''}`, { limit: 1 });
            if (searched && searched.length > 0) {
                streamSource = searched[0].url;
            } else {
                serverQueue.textChannel.send('❌ Impossibile trovare una fonte riproducibile per questo brano Spotify.').catch(() => {});
                serverQueue.songs.shift();
                return playSong(client, guildId, serverQueue.songs[0]);
            }
        } else if (!song.url.startsWith('http')) {
            const searched = await play.search(song.url, { limit: 1 });
            if (searched && searched.length > 0) {
                streamSource = searched[0].url;
            } else {
                serverQueue.textChannel.send('❌ Nessun risultato trovato per la ricerca.').catch(() => {});
                serverQueue.songs.shift();
                return playSong(client, guildId, serverQueue.songs[0]);
            }
        }

        // Ottiene lo stream audio tramite play-dl
        const sourceStream = await play.stream(streamSource);
        
        // Usa demuxProbe per evitare il blocco sul caricamento ed estrarre il tipo corretto
        const { stream, type } = await demuxProbe(sourceStream.stream);

        const resource = createAudioResource(stream, { 
            inputType: type,
            inlineVolume: true 
        });
        
        resource.volume.setVolume(1.0);
        serverQueue.player.play(resource);

        serverQueue.textChannel.send(`🎶 In riproduzione: **${song.title}**`).catch(() => {});
    } catch (error) {
        console.error('Errore durante lo streaming:', error);
        serverQueue.textChannel.send('❌ Si è verificato un errore durante la riproduzione del brano.').catch(() => {});
        serverQueue.songs.shift();
        playSong(client, guildId, serverQueue.songs[0]);
    }
}

module.exports = {
    name: 'play',
    description: 'Riproduci musica da YouTube o Spotify',
    options: [{
        name: 'song',
        type: 3,
        description: 'Nome del brano o link (YouTube / Spotify)',
        required: true
    }],
    async execute(interaction) {
        const voiceChannel = interaction.member.voice.channel;
        if (!voiceChannel) {
            return interaction.reply({ content: '❌ Devi essere in un canale vocale per ascoltare la musica!', ephemeral: true });
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
            interaction.client.musicQueues.get = interaction.client.musicQueues.get || (() => serverQueue); // Safe fallback
            interaction.client.musicQueues.set(interaction.guild.id, serverQueue);
            connection.subscribe(player);

            player.on(AudioPlayerStatus.Idle, () => {
                serverQueue.songs.shift();
                playSong(interaction.client, interaction.guild.id, serverQueue.songs[0]);
            });

            player.on('error', error => {
                console.error('Errore del player audio:', error);
                serverQueue.songs.shift();
                playSong(interaction.client, interaction.guild.id, serverQueue.songs[0]);
            });
        }

        serverQueue.songs.push({ title: songQuery, url: songQuery });
        if (serverQueue.songs.length === 1) {
            await interaction.editReply(`🎵 Caricamento in corso...`);
            playSong(interaction.client, interaction.guild.id, serverQueue.songs[0]);
        } else {
            await interaction.editReply(`📥 Aggiunto alla coda: **${songQuery}**`);
        }
    },
};
