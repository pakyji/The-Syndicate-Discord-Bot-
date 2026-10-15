/**
 * /music — YouTube playback.
 *
 * The upstream repo declared `@discordjs/voice` in package.json and created
 * `client.musicQueues = new Map()` in index.js, and that was the whole feature:
 * no command, no player, nothing ever read the Map. All the real logic lives in
 * lib/music.js; this file is the command surface.
 *
 * Everything is one `/music` command with subcommands rather than a dozen
 * top-level commands, so the command list stays readable and the whole feature
 * can be switched off with `MUSIC_ENABLED=false`.
 *
 * Invariants enforced here (and again in lib/music.js, because a button handler
 * can reach the same code paths):
 *  • The bot only ever joins the REQUESTER's voice channel.
 *  • Transport commands (skip/pause/stop/volume/...) only work from inside the
 *    same channel the player is in, so nobody can hijack another room's session.
 *  • Every reply is ephemeral except the now-playing embed, which the engine posts.
 */
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const music = require('../lib/music');
const config = require('../lib/config');

/**
 * Require the caller to be in the same voice channel as the player.
 * @returns {{ok:true, queue:object} | {ok:false, error:string}}
 */
function requireSameChannel(interaction) {
    const q = music.getQueue(interaction.guildId);
    if (!q || (!q.current && !q.tracks.length)) {
        return { ok: false, error: 'Nothing is playing. Queue something with `/music play`.' };
    }
    const channel = interaction.member?.voice?.channel;
    if (!channel) {
        return { ok: false, error: 'Join a voice channel to control the player.' };
    }
    if (q.voiceChannelId && channel.id !== q.voiceChannelId) {
        return {
            ok: false,
            error: `The player is in <#${q.voiceChannelId}> — join that channel to control it.`,
        };
    }
    return { ok: true, queue: q };
}

/** Does the bot have permission to send the reply where it needs to? */
function canReplyIn(interaction) {
    const me = interaction.guild?.members?.me;
    const perms = interaction.channel?.permissionsFor?.(me);
    return !perms || perms.has(PermissionFlagsBits.SendMessages);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('music')
        .setDescription('Play and control YouTube audio in a voice channel')
        .setDMPermission(false)

        .addSubcommand((sub) => sub
            .setName('play')
            .setDescription('Play a YouTube link, or search YouTube for a song')
            .addStringOption((o) => o
                .setName('query')
                .setDescription('Song name, YouTube URL or playlist URL')
                .setRequired(true)
                .setMinLength(2)
                .setMaxLength(300)))

        .addSubcommand((sub) => sub
            .setName('queue')
            .setDescription('Show what is playing and what is queued next'))

        .addSubcommand((sub) => sub
            .setName('nowplaying')
            .setDescription('Show the current track with a progress bar'))

        .addSubcommand((sub) => sub
            .setName('pause')
            .setDescription('Pause the current track'))
        .addSubcommand((sub) => sub
            .setName('resume')
            .setDescription('Resume a paused track'))

        .addSubcommand((sub) => sub
            .setName('skip')
            .setDescription('Skip the current track'))

        .addSubcommand((sub) => sub
            .setName('stop')
            .setDescription('Clear the queue, stop playback and leave the voice channel'))
        .addSubcommand((sub) => sub
            .setName('disconnect')
            .setDescription('Leave the voice channel (alias of stop)'))

        .addSubcommand((sub) => sub
            .setName('volume')
            .setDescription('Show or set the playback volume')
            .addIntegerOption((o) => o
                .setName('percent')
                .setDescription('0–200 (leave empty to show the current volume)')
                .setMinValue(0)
                .setMaxValue(200)))

        .addSubcommand((sub) => sub
            .setName('loop')
            .setDescription('Loop the current track or the whole queue')
            .addStringOption((o) => o
                .setName('mode')
                .setDescription('What to loop')
                .setRequired(true)
                .addChoices(
                    { name: 'Off', value: 'off' },
                    { name: 'This track', value: 'track' },
                    { name: 'Whole queue', value: 'queue' },
                )))

        .addSubcommand((sub) => sub
            .setName('shuffle')
            .setDescription('Shuffle the queued tracks'))

        .addSubcommand((sub) => sub
            .setName('remove')
            .setDescription('Remove a track from the queue by its position')
            .addIntegerOption((o) => o
                .setName('position')
                .setDescription('The number shown in /music queue')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(1000)))

        .addSubcommand((sub) => sub
            .setName('clear')
            .setDescription('Empty the queue but keep the current track playing')),

    category: 'Music',

    async execute(interaction) {
        if (!config.music.enabled) {
            return interaction.reply({
                content: '❌ Music is disabled on this bot (`MUSIC_ENABLED=false`).',
                ephemeral: true,
            });
        }
        if (!interaction.inGuild()) {
            return interaction.reply({ content: '❌ Music only works inside a server.', ephemeral: true });
        }
        if (!canReplyIn(interaction)) {
            return interaction.reply({ content: '❌ I cannot send messages in this channel.', ephemeral: true });
        }

        const sub = interaction.options.getSubcommand();

        try {
            switch (sub) {
                case 'play': return await handlePlay(interaction);
                case 'queue': return await handleQueue(interaction);
                case 'nowplaying': return await handleNowPlaying(interaction);
                default: return await handleTransport(interaction, sub);
            }
        } catch (error) {
            console.error(`[music] /music ${sub} failed:`, error);
            const payload = { content: `❌ That failed: ${String(error.message).slice(0, 300)}`, ephemeral: true };
            if (interaction.deferred) return interaction.editReply(payload);
            if (interaction.replied) return interaction.followUp(payload);
            return interaction.reply(payload);
        }
    },
};

/* ------------------------------------------------------------------ *
 * /music play
 * ------------------------------------------------------------------ */
async function handlePlay(interaction) {
    const query = interaction.options.getString('query', true);

    // A search plus a stream handshake can easily exceed Discord's 3 seconds.
    await interaction.deferReply({ ephemeral: true });

    const result = await music.enqueue({ interaction, query });
    if (!result.ok) return interaction.editReply({ content: `❌ ${result.error}` });

    const first = result.nowPlaying;
    const lines = [];
    if (result.added === 1 && first && first.url === result.nowPlaying?.url) {
        lines.push(`✅ Queued **${music.escapeMd(first.title).slice(0, 120)}** \`${music.formatDuration(first.durationSec)}\``);
    } else {
        lines.push(`✅ Queued **${result.added}** track(s).`);
    }
    if (result.truncated) {
        lines.push(`⚠️ Only the first ${config.music.maxPlaylistsPerRequest} playlist entries were added.`);
    }

    const q = music.getQueue(interaction.guildId);
    const info = music.describe(q);
    if (info?.current) {
        lines.push('');
        lines.push(`🎶 **Now:** ${music.escapeMd(info.current.title).slice(0, 120)}`);
        lines.push(`⏭️ **Up next:** ${info.tracks.length} track(s), ${music.formatDuration(info.queuedDuration)}`);
    }
    if (result.alternatives?.length) {
        lines.push('');
        lines.push('*Also matched:*');
        for (const alt of result.alternatives.slice(0, 3)) {
            lines.push(`• ${music.escapeMd(alt.title).slice(0, 80)} \`${music.formatDuration(alt.durationSec)}\``);
        }
        lines.push('*If that was the wrong one, paste the exact YouTube link.*');
    }

    return interaction.editReply({ content: lines.join('\n').slice(0, 1900) });
}

/* ------------------------------------------------------------------ *
 * /music queue + /music nowplaying
 * ------------------------------------------------------------------ */
async function handleQueue(interaction) {
    const q = music.getQueue(interaction.guildId);
    const info = music.describe(q);

    if (!info || (!info.current && !info.tracks.length)) {
        return interaction.reply({
            content: '🔇 Nothing is playing. Start something with `/music play <song or link>`.',
            ephemeral: true,
        });
    }

    const embed = new EmbedBuilder()
        .setColor(0x1db954)
        .setTitle('🎵 Playback queue')
        .setDescription(
            info.current
                ? `**Now:** ${music.escapeMd(info.current.title).slice(0, 150)}\n`
                    + `${music.progressBar(q)}\n`
                    + `\`${music.formatDuration(info.elapsed)} / ${music.formatDuration(info.current.durationSec)}\`\n\n`
                : '**Now:** nothing\n\n',
        )
        .addFields(
            { name: 'Loop', value: info.loopMode, inline: true },
            { name: 'Volume', value: `${info.volume}%`, inline: true },
            { name: 'Voice channel', value: info.voiceChannelId ? `<#${info.voiceChannelId}>` : '—', inline: true },
        )
        .setFooter({ text: `${info.tracks.length} queued · ${music.formatDuration(info.queuedDuration)} total · ${info.playedCount} played this session` })
        .setTimestamp();

    if (info.tracks.length) {
        const shown = info.tracks.slice(0, 10);
        embed.addFields({
            name: 'Up next',
            value: shown.map((t, i) => music.trackLine(t, i)).join('\n').slice(0, 1024)
                + (info.tracks.length > shown.length ? `\n*…and ${info.tracks.length - shown.length} more*` : ''),
            inline: false,
        });
    }

    return interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleNowPlaying(interaction) {
    const q = music.getQueue(interaction.guildId);
    const info = music.describe(q);

    if (!info?.current) {
        return interaction.reply({ content: '🔇 Nothing is playing right now.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
        .setColor(0x1db954)
        .setTitle('🎶 Now playing')
        .setDescription(
            `**[${music.escapeMd(info.current.title).slice(0, 200)}](${info.current.url})**\n\n`
            + `${music.progressBar(q)}\n`
            + `\`${music.formatDuration(info.elapsed)} / ${music.formatDuration(info.current.durationSec)}\``
            + ` · ${info.status === 'paused' ? '⏸️ paused' : '▶️ playing'}`,
        )
        .addFields(
            { name: 'Channel', value: music.escapeMd(info.current.channel || 'Unknown').slice(0, 100), inline: true },
            { name: 'Requested by', value: `<@${info.current.requestedBy}>`, inline: true },
            { name: 'Volume', value: `${info.volume}%`, inline: true },
        )
        .setFooter({ text: `${info.tracks.length} more queued` })
        .setTimestamp();
    if (info.current.thumbnail) embed.setThumbnail(info.current.thumbnail);

    return interaction.reply({ embeds: [embed], ephemeral: true });
}

/* ------------------------------------------------------------------ *
 * Transport controls
 * ------------------------------------------------------------------ */
async function handleTransport(interaction, sub) {
    const gated = requireSameChannel(interaction);
    if (!gated.ok) return interaction.reply({ content: `❌ ${gated.error}`, ephemeral: true });
    const q = gated.queue;

    switch (sub) {
        case 'pause': {
            if (!music.pause(q)) {
                return interaction.reply({ content: '⚠️ It was already paused.', ephemeral: true });
            }
            return interaction.reply({ content: '⏸️ Paused. `/music resume` to continue.' });
        }

        case 'resume': {
            if (!music.resume(q)) {
                return interaction.reply({ content: '⚠️ It was already playing.', ephemeral: true });
            }
            return interaction.reply({ content: '▶️ Resumed.' });
        }

        case 'skip': {
            const was = music.skip(q);
            const next = q.tracks[0];
            return interaction.reply({
                content: `⏭️ Skipped **${music.escapeMd(was?.title || 'the track').slice(0, 120)}**.`
                    + (next ? ` Next: **${music.escapeMd(next.title).slice(0, 120)}**` : ' The queue is now empty.'),
            });
        }

        case 'stop':
        case 'disconnect': {
            const count = q.tracks.length + (q.current ? 1 : 0);
            music.destroyQueue(q, null);
            return interaction.reply({
                content: `⏹️ Stopped and left the voice channel (${count} track(s) discarded).`,
            });
        }

        case 'volume': {
            const requested = interaction.options.getInteger('percent');
            if (requested === null || requested === undefined) {
                return interaction.reply({ content: `🔊 Volume is **${q.volume}%**.`, ephemeral: true });
            }
            const applied = music.setVolume(q, requested);
            return interaction.reply({ content: `🔊 Volume set to **${applied}%**.` });
        }

        case 'loop': {
            const mode = music.setLoop(q, interaction.options.getString('mode', true));
            const label = { off: '➡️ Looping is OFF.', track: '🔂 Looping THIS TRACK.', queue: '🔁 Looping the WHOLE QUEUE.' }[mode];
            return interaction.reply({ content: label });
        }

        case 'shuffle': {
            const moved = music.shuffle(q, interaction.user.id);
            if (!moved) return interaction.reply({ content: '⚠️ Not enough queued tracks to shuffle.', ephemeral: true });
            return interaction.reply({ content: `🔀 Shuffled **${moved}** queued track(s).` });
        }

        case 'remove': {
            const position = interaction.options.getInteger('position', true);
            const removed = music.remove(q, position);
            if (!removed) {
                return interaction.reply({
                    content: `❌ There is no track at position ${position}. Check \`/music queue\`.`,
                    ephemeral: true,
                });
            }
            return interaction.reply({
                content: `🗑️ Removed **${music.escapeMd(removed.title).slice(0, 120)}** from position ${position}.`,
            });
        }

        case 'clear': {
            const count = music.clear(q);
            if (!count) return interaction.reply({ content: '⚠️ The queue was already empty.', ephemeral: true });
            return interaction.reply({
                content: `🧹 Cleared **${count}** queued track(s). The current track keeps playing.`,
            });
        }

        default:
            return interaction.reply({ content: `❌ Unknown subcommand "${sub}".`, ephemeral: true });
    }
}
