const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

// Mappa globale per gestire le code musicali per ogni server
const musicQueues = new Map();

module.exports = {
    name: 'play',
    description: 'Riproduci una canzone o un flusso audio nel canale vocale',
    musicQueues: musicQueues, // Esportato per permettere a index.js di gestire i pulsanti

    async execute(message, args) {
        const voiceChannel = message.member.voice.channel;

        if (!voiceChannel) {
            return message.reply('❌ Devi prima entrare in un canale vocale!');
        }

        const query = args.join(' ');
        if (!query) {
            return message.reply('❌ Per favore, inserisci il link o il nome della canzone da riprodurre!');
        }

        let serverQueue = musicQueues.get(message.guild.id);

        if (!serverQueue) {
            serverQueue = {
                textChannel: message.channel,
                voiceChannel: voiceChannel,
                connection: null,
                player: createAudioPlayer(),
                songs: [],
                volume: 5,
                playing: true
            };
            musicQueues.set(message.guild.id, serverQueue);
        }

        // Aggiungiamo la canzone alla coda (per semplicità gestiamo URL diretti o flussi audio)
        serverQueue.songs.push(query);

        try {
            if (!serverQueue.connection) {
                serverQueue.connection = joinVoiceChannel({
                    channelId: voiceChannel.id,
                    guildId: message.guild.id,
                    adapterCreator: message.guild.voiceAdapterCreator,
                    selfDeaf: true,
                });
                serverQueue.connection.subscribe(serverQueue.player);
            }

            if (serverQueue.songs.length === 1) {
                playSong(message.guild, serverQueue.songs[0]);
            } else {
                await message.reply(`✅ Brano aggiunto alla coda: **${query}**`);
            }
        } catch (error) {
            console.error('Play error:', error);
            musicQueues.delete(message.guild.id);
            await message.reply('❌ Si è verificato un errore durante la connessione al canale vocale.');
        }
    }
};

async function playSong(guild, song) {
    const serverQueue = musicQueues.get(guild.id);

    if (!song) {
        if (serverQueue.connection) {
            serverQueue.connection.destroy();
        }
        musicQueues.delete(guild.id);
        return;
    }

    try {
        // Creazione della risorsa audio
        const resource = createAudioResource(song);
        serverQueue.player.play(resource);

        serverQueue.player.on(AudioPlayerStatus.Idle, () => {
            serverQueue.songs.shift();
            playSong(guild, serverQueue.songs[0]);
        });

        const embed = new EmbedBuilder()
            .setColor('#2b2d31')
            .setTitle('🎶 Riproduzione in corso')
            .setDescription(`**${song}**`);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('music_skip').setLabel('Salta').setStyle(ButtonStyle.Primary).setEmoji('⏭️'),
            new ButtonBuilder().setCustomId('music_disconnect').setLabel('Disconnetti').setStyle(ButtonStyle.Danger).setEmoji('⏹️')
        );

        await serverQueue.textChannel.send({ embeds: [embed], components: [row] });
    } catch (error) {
        console.error('Errore durante la riproduzione:', error);
        serverQueue.songs.shift();
        playSong(guild, serverQueue.songs[0]);
    }
}
