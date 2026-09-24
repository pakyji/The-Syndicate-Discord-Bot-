const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const play = require('play-dl');

// Guilds ke music queues manage karne ke liye map
const musicQueues = new Map();

module.exports = {
    name: 'play',
    description: 'Play music from YouTube or Spotify in your voice channel',
    async execute(message, args) {
        const query = args.join(' ');
        if (!query) return message.reply('❌ Please provide a song name or URL!');

        const voiceChannel = message.member.voice.channel;
        if (!voiceChannel) {
            return message.reply('❌ You need to be in a voice channel to play music!');
        }

        let serverQueue = musicQueues.get(message.guild.id);

        try {
            let songInfo;
            if (play.yt_validate(query) === 'video') {
                const info = await play.video_info(query);
                songInfo = { title: info.video_details.title, url: info.video_details.url };
            } else {
                const searchResult = await play.search(query, { limit: 1 });
                if (!searchResult.length) return message.reply('❌ No results found.');
                songInfo = { title: searchResult[0].title, url: searchResult[0].url };
            }

            if (!serverQueue) {
                const queueConstruct = {
                    textChannel: message.channel,
                    voiceChannel: voiceChannel,
                    connection: null,
                    player: createAudioPlayer(),
                    songs: [],
                };

                musicQueues.set(message.guild.id, queueConstruct);
                queueConstruct.songs.push(songInfo);

                try {
                    const connection = joinVoiceChannel({
                        channelId: voiceChannel.id,
                        guildId: message.guild.id,
                        adapterCreator: message.guild.voiceAdapterCreator,
                        selfDeaf: true,
                    });
                    queueConstruct.connection = connection;
                    playSong(message.guild, queueConstruct.songs[0], musicQueues);

                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('music_skip').setLabel('Skip').setStyle(ButtonStyle.Primary).setEmoji('⏭️'),
                        new ButtonBuilder().setCustomId('music_disconnect').setLabel('Disconnect').setStyle(ButtonStyle.Danger).setEmoji('⏹️')
                    );

                    await message.channel.send({ content: `🎶 Now Playing (HD): **${songInfo.title}**`, components: [row] });
                } catch (err) {
                    console.error(err);
                    musicQueues.delete(message.guild.id);
                    return message.reply('❌ Could not join the voice channel.');
                }
            } else {
                serverQueue.songs.push(songInfo);
                return message.channel.send(`✅ Added to queue: **${songInfo.title}**`);
            }
        } catch (error) {
            console.error(error);
            return message.reply('❌ An error occurred while processing the song.');
        }
    }
};

async function playSong(guild, song, musicQueues) {
    const serverQueue = musicQueues.get(guild.id);
    if (!song) {
        if (serverQueue && serverQueue.connection) {
            serverQueue.connection.destroy();
            musicQueues.delete(guild.id);
        }
        return;
    }

    try {
        const stream = await play.stream(song.url, { discordPlayerCompatibility: true, quality: 2 });
        const resource = createAudioResource(stream.stream, { inputType: stream.type, inlineVolume: true });
        resource.volume.setVolume(1.0);

        serverQueue.player.play(resource);
        serverQueue.connection.subscribe(serverQueue.player);

        serverQueue.player.removeAllListeners(AudioPlayerStatus.Idle);
        serverQueue.player.once(AudioPlayerStatus.Idle, () => {
            serverQueue.songs.shift();
            playSong(guild, serverQueue.songs[0], musicQueues);
        });
    } catch (error) {
        console.error('PlaySong error:', error);
        serverQueue.songs.shift();
        playSong(guild, serverQueue.songs[0], musicQueues);
    }
}

// Export queues map so interaction buttons (Skip/Disconnect) can access it easily if needed
module.exports.musicQueues = musicQueues;
