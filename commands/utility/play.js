const { SlashCommandBuilder } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const play = require('play-dl');

const musicQueues = new Map();

module.exports = {
    name: 'play',
    description: 'Play music from YouTube or Spotify link/query',
    musicQueues: musicQueues,
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Play music from YouTube or Spotify link/query')
        .addStringOption(option =>
            option.setName('song')
                .setDescription('The song name or URL (YouTube / Spotify)')
                .setRequired(true)),
    
    async execute(interactionOrMessage, args) {
        let interaction = interactionOrMessage;
        let guild = interaction.guild;
        let member = interaction.member;
        let channel = interaction.channel;

        // Support both slash command and text prefix (!play)
        let songQuery = '';
        const isSlash = interaction.isChatInputCommand?.() || false;

        if (isSlash) {
            songQuery = interaction.options.getString('song');
            await interaction.deferReply();
        } else {
            songQuery = args ? args.join(' ') : '';
        }

        if (!member?.voice.channel) {
            const replyMsg = '❌ You need to be in a voice channel to play music!';
            if (isSlash) return interaction.editReply(replyMsg);
            return interaction.reply(replyMsg);
        }

        if (!songQuery) {
            const replyMsg = '❌ Please provide a song name or link.';
            if (isSlash) return interaction.editReply(replyMsg);
            return interaction.reply(replyMsg);
        }

        const voiceChannel = member.voice.channel;
        let serverQueue = musicQueues.get(guild.id);

        if (!serverQueue) {
            const connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: guild.id,
                adapterCreator: guild.voiceAdapterCreator,
            });
            const player = createAudioPlayer();
            serverQueue = { textChannel: channel, voiceChannel, connection, player, songs: [] };
            musicQueues.set(guild.id, serverQueue);
            connection.subscribe(player);

            player.on(AudioPlayerStatus.Idle, () => {
                serverQueue.songs.shift();
                playSong(guild.id, serverQueue.songs[0]);
            });
        }

        serverQueue.songs.push({ title: songQuery, url: songQuery });

        if (serverQueue.songs.length === 1) {
            if (isSlash) {
                await interaction.editReply(`🎵 Loading song...`);
            } else {
                await interaction.reply(`🎵 Loading song...`);
            }
            playSong(guild.id, serverQueue.songs[0]);
        } else {
            const msg = `📥 Added to queue: **${songQuery}**`;
            if (isSlash) {
                await interaction.editReply(msg);
            } else {
                await interaction.reply(msg);
            }
        }
    }
};

async function playSong(guildId, song) {
    const serverQueue = musicQueues.get(guildId);
    if (!serverQueue || !song) return;

    try {
        let streamSource = song.url;
        
        if (play.is_spotify(song.url)) {
            const spotifyData = await play.spotify(song.url);
            const searched = await play.search(`${spotifyData.name} ${spotifyData.artists[0]?.name || ''}`, { limit: 1 });
            if (searched && searched.length > 0) {
                streamSource = searched[0].url;
            } else {
                serverQueue.textChannel.send('❌ Could not find a playable source for this Spotify track.').catch(() => {});
                serverQueue.songs.shift();
                return playSong(guildId, serverQueue.songs[0]);
            }
        } else if (!song.url.startsWith('http')) {
            const searched = await play.search(song.url, { limit: 1 });
            if (searched && searched.length > 0) {
                streamSource = searched[0].url;
            } else {
                serverQueue.textChannel.send('❌ No results found for your query.').catch(() => {});
                serverQueue.songs.shift();
                return playSong(guildId, serverQueue.songs[0]);
            }
        }

        const stream = await play.stream(streamSource);
        const resource = createAudioResource(stream.stream, { 
            inputType: stream.type,
            inlineVolume: true 
        });
        
        resource.volume.setVolume(1.0);
        serverQueue.player.play(resource);

        serverQueue.textChannel.send(`🎶 Now playing: **${song.title}**`).catch(() => {});
    } catch (error) {
        console.error('Playback stream error:', error);
        serverQueue.songs.shift();
        playSong(guildId, serverQueue.songs[0]);
    }
}
