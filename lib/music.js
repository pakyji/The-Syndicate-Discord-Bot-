/**
 * Music engine — YouTube playback through @discordjs/voice + play-dl.
 *
 * The upstream repo had NO music at all: `@discordjs/voice` was listed in
 * package.json, `client.musicQueues = new Map()` was created in index.js, and
 * that was the entire feature. Nothing ever read the Map and no command existed.
 *
 * Design notes, in the order they tend to bite:
 *
 *  • ONE QUEUE PER GUILD, held in memory. Music state is deliberately NOT
 *    persisted: a queue that survives a restart points at voice connections and
 *    audio streams that no longer exist. The store is for user data.
 *  • EVERY limit is configurable and clamped in lib/config.js. Queue length,
 *    per-track duration, playlist expansion, idle disconnect and the play
 *    cooldown all exist because an unbounded queue is a memory leak and an
 *    unbounded track is a 10-hour loop video that locks the bot for a day.
 *  • THE REQUESTER'S VOICE CHANNEL IS THE ONLY ONE THAT COUNTS. The bot never
 *    picks a channel, never follows someone who wanders off, and refuses
 *    commands from members who are not in the same channel as the player.
 *  • NATIVE DEPENDENCIES ARE OPTIONAL AT RUNTIME. `ffmpeg-static` and the opus
 *    encoder are resolved defensively so a host where the native build failed
 *    still boots (and `MUSIC_ENABLED=false` disables the whole feature).
 *  • NOTHING HERE IS ALLOWED TO THROW INTO AN INTERACTION. Every Discord API call
 *    is wrapped; a failed stream skips the track rather than killing the player.
 */
const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    entersState,
    AudioPlayerStatus,
    VoiceConnectionStatus,
    VoiceConnectionDisconnectReason,
    NoSubscriberBehavior,
} = require('@discordjs/voice');
const {
    EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, ChannelType,
} = require('discord.js');
const play = require('play-dl');
const config = require('./config');
const { Cooldowns } = require('./cooldowns');

/* ------------------------------------------------------------------ *
 * Dependency bootstrap
 * ------------------------------------------------------------------ */
// ffmpeg-static ships a prebuilt binary; @discordjs/voice looks for it on PATH
// otherwise. Resolved before any player is created, and skipped silently when the
// optional dependency could not be installed on this platform.
try {
    // eslint-disable-next-line global-require
    const ffmpegPath = require('ffmpeg-static');
    if (ffmpegPath) {
        process.env.FFMPEG_PATH = ffmpegPath;
        if (!process.env.FFMPEG_BINARY) process.env.FFMPEG_BINARY = ffmpegPath;
    }
} catch {
    // No bundled ffmpeg — @discordjs/voice will fall back to PATH.
}

/** Human-readable summary of what the voice stack managed to load. */
function dependencyReport() {
    try {
        // eslint-disable-next-line global-require
        const { generateDependencyReport } = require('@discordjs/voice');
        return generateDependencyReport();
    } catch (error) {
        return `Dependency report unavailable: ${error.message}`;
    }
}

/** Can this module actually be LOADED? (Not merely: is its folder installed?) */
function canRequire(name) {
    try {
        require(name);
        return true;
    } catch {
        return false;
    }
}

/**
 * The opus encoders @discordjs/voice tries, in its own preference order.
 * `@discordjs/opus` is native: its folder can be present while the compiled
 * binding is missing (Android/Termux, `--ignore-scripts`, a blocked toolchain), and
 * generateDependencyReport() still prints a version for it. So it is require()d, not
 * just resolved. `opusscript` is pure JS and always loads.
 */
const OPUS_ENCODERS = ['@discordjs/opus', 'opusscript'];

/**
 * The encryption libraries @discordjs/voice tries, mapped to the module it actually
 * imports. `@noble/ciphers` is ESM-submodule-only: `require('@noble/ciphers')`
 * deliberately throws ("import submodules instead"), and voice loads
 * `@noble/ciphers/chacha` through a dynamic import() — so a synchronous
 * require() of the package root is the WRONG probe and reports a healthy install
 * as broken. The sync check resolves the submodule; the async check imports it.
 */
const CRYPTO_LIBS = [
    ['sodium-native', 'sodium-native'],
    ['sodium', 'sodium'],
    ['libsodium-wrappers', 'libsodium-wrappers'],
    ['@stablelib/xchacha20poly1305', '@stablelib/xchacha20poly1305'],
    ['@noble/ciphers', '@noble/ciphers/chacha'],
];

/** Resolve an ffmpeg binary: the bundled one first, then PATH. */
function resolveFfmpeg() {
    try {
        // eslint-disable-next-line global-require
        const bundled = require('ffmpeg-static');
        if (bundled && require('fs').existsSync(bundled)) return bundled;
    } catch { /* not installed */ }
    if (process.env.FFMPEG_PATH && require('fs').existsSync(process.env.FFMPEG_PATH)) return process.env.FFMPEG_PATH;
    for (const dir of String(process.env.PATH || '').split(':')) {
        if (!dir) continue;
        const candidate = require('path').join(dir, 'ffmpeg');
        try {
            if (require('fs').existsSync(candidate)) return candidate;
        } catch { /* unreadable directory */ }
    }
    return null;
}

/**
 * Authoritative readiness check — mirrors what @discordjs/voice really does:
 * `await import(libName)` over its candidate list, plus awaiting
 * `libsodium-wrappers.ready`. This is what enqueue() uses before it promises
 * anybody audio.
 */
async function voiceReadyAsync() {
    const opus = OPUS_ENCODERS.find(canRequire) || null;

    let crypto = null;
    for (const [name, probe] of CRYPTO_LIBS) {
        try {
            const lib = await import(probe);
            if (name === 'libsodium-wrappers' && lib.ready) await lib.ready;
            crypto = name;
            break;
        } catch { /* try the next candidate */ }
    }

    const ffmpeg = resolveFfmpeg();
    const missing = [!opus && 'an opus encoder', !crypto && 'an encryption library', !ffmpeg && 'ffmpeg'].filter(Boolean);

    return {
        ok: !missing.length,
        hasOpus: !!opus, hasCrypto: !!crypto, hasFfmpeg: !!ffmpeg,
        opus, crypto, ffmpeg, missing,
        report: [
            `Opus encoder:  ${opus || 'MISSING (tried ' + OPUS_ENCODERS.join(', ') + ')'}`,
            `Encryption:    ${crypto || 'MISSING (tried ' + CRYPTO_LIBS.map(([n]) => n).join(', ') + ')'}`,
            `FFmpeg binary: ${ffmpeg || 'MISSING (ffmpeg-static not built and no ffmpeg on PATH)'}`,
        ].join('\n'),
    };
}

/**
 * Voice-stack readiness (synchronous, approximate for encryption).
 *
 * ⭐ This deliberately does NOT trust `generateDependencyReport()`. That report
 * prints a version for any package whose FOLDER is installed, but a native module
 * whose binding was never built still shows up as present and then throws the first
 * time audio is encoded. On Android/Termux, in a container with
 * `npm install --ignore-scripts`, or anywhere the optional native build was skipped,
 * `@discordjs/opus` is "found" and completely unusable. So each piece is actually
 * require()d, and the ffmpeg binary is actually stat()d.
 */
function voiceReady() {
    const opus = OPUS_ENCODERS.find(canRequire) || null;
    // Resolve only — an ESM submodule cannot be require()d. voiceReadyAsync() is
    // the authoritative check and is what enqueue() actually uses.
    const crypto = CRYPTO_LIBS.find(([, probe]) => {
        try { require.resolve(probe); return true; } catch { return false; }
    })?.[0] || null;
    const ffmpeg = resolveFfmpeg();

    const lines = [
        `Opus encoder:  ${opus || 'MISSING (tried ' + OPUS_ENCODERS.join(', ') + ')'}`,
        `Encryption:    ${crypto || 'MISSING (tried ' + CRYPTO_LIBS.join(', ') + ')'}`,
        `FFmpeg binary: ${ffmpeg || 'MISSING (ffmpeg-static not built and no ffmpeg on PATH)'}`,
    ];
    const missing = [!opus && 'an opus encoder', !crypto && 'an encryption library', !ffmpeg && 'ffmpeg'].filter(Boolean);

    return {
        ok: !missing.length,
        hasOpus: !!opus,
        hasCrypto: !!crypto,
        hasFfmpeg: !!ffmpeg,
        opus,
        crypto,
        ffmpeg,
        missing,
        report: lines.join('\n'),
        /** @discordjs/voice's own view — kept for diagnostics only. */
        dependencyReport: dependencyReport(),
    };
}

/* ------------------------------------------------------------------ *
 * Constants
 * ------------------------------------------------------------------ */
const LOOP_MODES = ['off', 'track', 'queue'];

/** Hard ceilings that are not worth making configurable. */
const HARD = {
    /** Discord embed description limit, with room for the footer. */
    embedDescription: 4000,
    /** A resolved stream must start within this long or the track is skipped. */
    streamTimeoutMs: 20_000,
    /** How long to wait for the voice connection to become Ready. */
    connectTimeoutMs: 20_000,
    /** Sweep stale queues this often. */
    sweepIntervalMs: 60_000,
};

/* ------------------------------------------------------------------ *
 * State
 * ------------------------------------------------------------------ */
/** @type {Map<string, object>} guildId -> queue */
const queues = new Map();

/** Per-member cooldown on adding tracks, so nobody can flood the queue. */
const playCooldown = new Cooldowns(config.music.playCooldownMs);

let sweepTimer = null;

function blankQueue(guildId) {
    return {
        guildId,
        connection: null,
        player: null,
        subscription: null,
        current: null,
        tracks: [],
        loopMode: 'off',
        volume: config.music.defaultVolume,
        textChannelId: null,
        voiceChannelId: null,
        startedAt: 0,
        /** Tracks successfully played since the queue was created. */
        playedCount: 0,
        idleTimer: null,
        emptyTimer: null,
        destroyed: false,
    };
}

function getQueue(guildId) {
    return queues.get(guildId) || null;
}

function ensureQueue(guildId) {
    let q = queues.get(guildId);
    if (!q || q.destroyed) {
        q = blankQueue(guildId);
        queues.set(guildId, q);
    }
    return q;
}

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */
function isYouTubeUrl(text) {
    return /^(https?:\/\/)?((www|m|music)\.)?(youtube\.com|youtu\.be)\//i.test(String(text || '').trim());
}

function isPlaylistUrl(text) {
    return /[?&]list=([\w-]+)/i.test(String(text || ''));
}

/** mm:ss / h:mm:ss -> seconds, or null. */
function parseDuration(raw) {
    if (typeof raw === 'number' && Number.isFinite(raw)) return Math.max(0, Math.round(raw));
    const text = String(raw ?? '').trim();
    if (!text) return null;
    const parts = text.split(':').map((p) => Number(p));
    // `Number('')` is 0, so without the empty-string guard "live" and "" both
    // parsed as a duration of 0 — and a 0-second track passes the "not a live
    // stream" filter, which is exactly what must never be queued.
    if (parts.some((p, i) => !Number.isFinite(p) || String(text.split(':')[i]).trim() === '')) return null;
    const seconds = parts.reduce((total, part) => total * 60 + part, 0);
    return seconds > 0 ? seconds : null;
}

/** seconds -> h:mm:ss (or m:ss). */
function formatDuration(totalSeconds) {
    const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    const hours = Math.floor(s / 3600);
    const minutes = Math.floor((s % 3600) / 60);
    const seconds = s % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

/** Total length of everything still queued. */
function queueDuration(q) {
    return q.tracks.reduce((sum, t) => sum + (Number(t.durationSec) || 0), 0);
}

function trackLine(track, index) {
    const pos = index === undefined ? '' : `\`${String(index + 1).padStart(2, '0')}.\``;
    const who = track.requestedBy ? `<@${track.requestedBy}>` : 'unknown';
    return `${pos} **${escapeMd(track.title).slice(0, 60)}** \`${formatDuration(track.durationSec)}\` — ${who}`;
}

/** Minimal markdown escaping so a video title cannot break the embed or ping. */
function escapeMd(text) {
    return String(text || '').replace(/([\\`*_~|>])/g, '\\$1').replace(/@/g, '@\u200b');
}

function withTimeout(promise, ms, label) {
    let timer = null;
    return Promise.race([
        Promise.resolve(promise).finally(() => { if (timer) clearTimeout(timer); }),
        new Promise((resolve, reject) => {
            timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
            timer.unref?.();
        }),
    ]);
}

/* ------------------------------------------------------------------ *
 * Track resolution
 * ------------------------------------------------------------------ */
/**
 * Turn a user-supplied query into tracks.
 *
 * Only YouTube is accepted. play-dl can talk to SoundCloud and Spotify too, but
 * those widen the attack surface (arbitrary redirects, third-party metadata) for
 * a feature nobody asked for, so the source is deliberately restricted.
 *
 * @returns {Promise<{tracks:object[], kind:'video'|'playlist', error?:string}>}
 */
async function resolveQuery(query, requesterId) {
    const text = String(query || '').trim().slice(0, 500);
    if (!text) return { tracks: [], kind: 'video', error: 'Give me a song name or a YouTube link.' };

    const maxTrackSec = config.music.maxTrackMinutes * 60;

    const shape = (video) => ({
        id: video.id || video.videoId || null,
        title: video.title || 'Unknown title',
        url: video.url || (video.id ? `https://www.youtube.com/watch?v=${video.id}` : null),
        durationSec: parseDuration(video.durationInSec ?? video.durationRaw),
        thumbnail: video.thumbnails?.[video.thumbnails.length - 1]?.url || null,
        channel: video.channel?.name || video.uploader || null,
        requestedBy: requesterId,
        addedAt: Date.now(),
    });

    try {
        /* ---- Playlist URL: expand, but cap the number of tracks ---- */
        if (isYouTubeUrl(text) && isPlaylistUrl(text)) {
            const list = await withTimeout(
                play.playlist_info(text, { incomplete: true }),
                config.music.searchTimeoutMs,
                'playlist lookup',
            );
            if (!list) return { tracks: [], kind: 'playlist', error: 'That playlist could not be loaded.' };

            const limit = config.music.maxPlaylistsPerRequest;
            const videos = (await list.all_videos()).slice(0, limit);
            const tracks = videos
                .filter((v) => v.private !== true && v.upcoming !== true)
                .map(shape)
                .filter((t) => t.url && t.durationSec && t.durationSec <= maxTrackSec);

            if (!tracks.length) {
                return {
                    tracks: [],
                    kind: 'playlist',
                    error: `Nothing usable in that playlist (live, private, unlisted-for-embed or longer than ${config.music.maxTrackMinutes} minutes).`,
                };
            }
            return { tracks, kind: 'playlist', truncated: videos.length >= limit };
        }

        /* ---- Direct video URL ---- */
        if (isYouTubeUrl(text)) {
            if (!(await play.yt_validate(text) === 'video')) {
                // 'search' means play-dl could not match it to a video.
                const info = await withTimeout(play.video_basic_info(text), config.music.searchTimeoutMs, 'video lookup')
                    .catch(() => null);
                if (!info) return { tracks: [], kind: 'video', error: 'That YouTube link could not be loaded.' };
                const t = shape(info.video_details);
                return finaliseSingle(t, maxTrackSec);
            }
            const info = await withTimeout(play.video_basic_info(text), config.music.searchTimeoutMs, 'video lookup');
            const t = shape(info.video_details);
            return finaliseSingle(t, maxTrackSec);
        }

        /* ---- Plain search ---- */
        const results = await withTimeout(
            play.search(text, { source: { youtube: 'video' }, limit: 5 }),
            config.music.searchTimeoutMs,
            'search',
        );
        const candidates = (results || [])
            .map(shape)
            // Skip lives and premieres: their duration is 0/undefined and the stream
            // never ends, which would lock the queue forever.
            .filter((t) => t.url && t.durationSec > 0 && t.durationSec <= maxTrackSec);

        if (!candidates.length) {
            return { tracks: [], kind: 'video', error: `No results for "${text.slice(0, 80)}".` };
        }
        return { tracks: [candidates[0]], kind: 'video', alternatives: candidates.slice(1, 4) };
    } catch (error) {
        console.error('[music] resolveQuery failed:', error.message);
        return { tracks: [], kind: 'video', error: `Could not resolve that query (${error.message.slice(0, 120)}).` };
    }
}

function finaliseSingle(track, maxTrackSec) {
    if (!track.url) return { tracks: [], kind: 'video', error: 'That video has no playable URL.' };
    if (!track.durationSec) return { tracks: [], kind: 'video', error: 'That looks like a live stream or a premiere — those cannot be queued.' };
    if (track.durationSec > maxTrackSec) {
        return {
            tracks: [],
            kind: 'video',
            error: `That video is ${formatDuration(track.durationSec)} long; the limit is ${config.music.maxTrackMinutes} minutes.`,
        };
    }
    return { tracks: [track], kind: 'video' };
}

/* ------------------------------------------------------------------ *
 * Voice connection
 * ------------------------------------------------------------------ */
/**
 * Check everything BEFORE joining, so the bot never half-connects and leaves a
 * silent player sitting in a channel.
 *
 * @returns {{ok:true, channel:import('discord.js').VoiceChannel} | {ok:false, error:string}}
 */
function checkVoiceContext(interaction) {
    if (!interaction.inGuild()) return { ok: false, error: 'Music only works inside a server.' };

    const member = interaction.member;
    const channel = member?.voice?.channel;
    if (!channel) {
        return { ok: false, error: 'Join a voice channel first, then run the command again.' };
    }
    if (channel.type === ChannelType.GuildStageVoice) {
        return { ok: false, error: 'I cannot play music in a Stage channel — use a normal voice channel.' };
    }
    if (config.music.blockedChannelIds.includes(channel.id)) {
        return { ok: false, error: 'Music is disabled in that voice channel.' };
    }

    const me = interaction.guild.members.me;
    const perms = channel.permissionsFor(me);
    if (!perms) return { ok: false, error: 'I cannot see that voice channel.' };

    const missing = [];
    if (!perms.has(PermissionFlagsBits.Connect)) missing.push('Connect');
    if (!perms.has(PermissionFlagsBits.Speak)) missing.push('Speak');
    if (perms.has(PermissionFlagsBits.ViewChannel) && channel.userLimit > 0
        && channel.members.size >= channel.userLimit && !perms.has(PermissionFlagsBits.MoveMembers)) {
        missing.push('room (the channel is full)');
    }
    if (missing.length) {
        return { ok: false, error: `I am missing **${missing.join(', ')}** in ${channel}.` };
    }

    // If a queue already exists, the requester must be in the SAME channel —
    // otherwise anyone could hijack or stop somebody else's session from another room.
    const existing = getQueue(interaction.guildId);
    if (existing && existing.voiceChannelId && existing.voiceChannelId !== channel.id) {
        return {
            ok: false,
            error: `The player is busy in <#${existing.voiceChannelId}>. Join that channel, or ask for it to be stopped with \`/music stop\`.`,
        };
    }

    return { ok: true, channel };
}

async function connect(q, voiceChannel) {
    if (q.connection && q.connection.state.status !== VoiceConnectionStatus.Destroyed) {
        return q.connection;
    }

    const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: voiceChannel.guild.id,
        adapterCreator: voiceChannel.guild.voiceAdapterCreator,
        // Do not disconnect the moment the bot is alone — the idle timer owns that
        // decision, so a requester stepping out for 10 seconds does not kill the queue.
        selfDeaf: true,
        selfMute: false,
    });

    q.connection = connection;
    q.voiceChannelId = voiceChannel.id;

    connection.on('error', (error) => {
        console.error('[music] voice connection error:', error.message);
        announce(q, `⚠️ Voice connection error: ${error.message.slice(0, 200)}`);
    });

    connection.on(VoiceConnectionStatus.Disconnected, async (_old, next) => {
        // Two race branches: a genuine disconnect, or a move between channels.
        if (next.reason === VoiceConnectionDisconnectReason.WebSocketClose && next.closeCode === 4014) {
            try {
                await entersState(connection, VoiceConnectionStatus.Connecting, 5_000);
                // It reconnected (channel move) — carry on.
            } catch {
                // Really kicked / channel deleted.
                destroyQueue(q, 'I was disconnected from the voice channel.');
            }
        } else if (connection.rejoinAttempts < 5) {
            // Transient network blip: back off and retry.
            await sleep((connection.rejoinAttempts + 1) * 5_000);
            try { connection.rejoin(); } catch { destroyQueue(q, 'Could not rejoin the voice channel.'); }
        } else {
            destroyQueue(q, 'Lost the voice connection after 5 attempts.');
        }
    });

    try {
        await withTimeout(
            entersState(connection, VoiceConnectionStatus.Ready, HARD.connectTimeoutMs),
            HARD.connectTimeoutMs + 1000,
            'voice connect',
        );
    } catch (error) {
        destroyQueue(q, `Could not connect to voice: ${error.message}`);
        throw error;
    }

    return connection;
}

function sleep(ms) {
    return new Promise((resolve) => { const t = setTimeout(resolve, ms); t.unref?.(); });
}

/* ------------------------------------------------------------------ *
 * Player
 * ------------------------------------------------------------------ */
function ensurePlayer(q) {
    if (q.player) return q.player;

    const player = createAudioPlayer({
        behaviors: {
            // Pause rather than idle when nobody has subscribed yet, so a track is
            // not silently consumed while the connection is still coming up.
            noSubscriber: NoSubscriberBehavior.Pause,
        },
    });

    player.on('error', (error) => {
        console.error('[music] player error:', error.message, error.resource?.metadata?.title || '');
        announce(q, `⚠️ Skipped **${escapeMd(error.resource?.metadata?.title || 'the current track')}** — ${error.message.slice(0, 160)}`);
        // Do not requeue: a track that errors usually errors again.
        playNext(q);
    });

    player.on(AudioPlayerStatus.Idle, () => {
        // The previous resource finished; move on.
        playNext(q);
    });

    q.player = player;
    return player;
}

function subscribe(q) {
    if (q.subscription || !q.connection || !q.player) return;
    q.subscription = q.connection.subscribe(q.player);
}

/** Send a short status line to the bound text channel; never throws. */
function announce(q, text) {
    if (!q.textChannelId) return;
    const channel = q.guild?.channels?.cache?.get(q.textChannelId);
    if (!channel?.send) return;
    channel.send({ content: text.slice(0, 1900), allowedMentions: { parse: [] } }).catch(() => {});
}

/* ------------------------------------------------------------------ *
 * Playback
 * ------------------------------------------------------------------ */
async function playNext(q) {
    if (q.destroyed) return;

    clearTimers(q);

    // Loop-track: replay what is already loaded.
    if (q.current && q.loopMode === 'track') {
        const replay = q.current;
        q.current = null;
        q.tracks.unshift(replay);
    } else if (q.current && q.loopMode === 'queue') {
        // Loop-queue: the finished track goes to the back.
        q.tracks.push(q.current);
        q.current = null;
    } else {
        q.current = null;
    }

    const track = q.tracks.shift();
    if (!track) {
        q.current = null;
        // Nothing left: linger briefly in case someone queues more, then leave.
        q.emptyTimer = setTimeout(() => {
            if (!q.current && !q.tracks.length) {
                destroyQueue(q, '👋 The queue finished, so I left the voice channel.');
            }
        }, config.music.emptyQueueDisconnectMs);
        q.emptyTimer.unref?.();
        return;
    }

    q.current = track;

    let resource;
    try {
        const source = await withTimeout(
            play.stream(track.url, {
                discordPlayerCompatibility: true,
                quality: 2, // highest available opus bitrate
            }),
            HARD.streamTimeoutMs,
            'stream',
        );
        resource = createAudioResource(source.stream, {
            inputType: source.type,
            inlineVolume: true,
            metadata: track,
        });
        resource.volume?.setVolume(Math.min(2, Math.max(0, q.volume / 100)));
    } catch (error) {
        console.error('[music] could not stream:', track.title, error.message);
        announce(q, `⚠️ Could not play **${escapeMd(track.title)}** (${error.message.slice(0, 120)}) — skipping.`);
        // Skip it and try the next one. `q.current` is cleared so it is not looped.
        q.current = null;
        setImmediate(() => playNext(q));
        return;
    }

    const player = ensurePlayer(q);
    subscribe(q);
    player.play(resource);
    q.startedAt = Date.now();
    q.playedCount += 1;

    try {
        await entersState(player, AudioPlayerStatus.Playing, 15_000);
    } catch {
        // The error/Idle handlers will move us on; nothing else to do here.
        return;
    }

    announceTrack(q, track);
    startIdleWatch(q);
}

/** Now-playing embed, posted once per track (not per join, not per edit). */
function announceTrack(q, track) {
    if (!q.textChannelId || !q.guild) return;
    const channel = q.guild.channels?.cache?.get(q.textChannelId);
    if (!channel?.send) return;

    const embed = new EmbedBuilder()
        .setColor(0x1db954)
        .setTitle('🎶 Now playing')
        .setDescription(`**[${escapeMd(track.title).slice(0, 200)}](${track.url})**`)
        .addFields(
            { name: 'Channel', value: escapeMd(track.channel || 'Unknown').slice(0, 100), inline: true },
            { name: 'Duration', value: formatDuration(track.durationSec), inline: true },
            { name: 'Requested by', value: `<@${track.requestedBy}>`, inline: true },
            { name: 'Volume', value: `${q.volume}%`, inline: true },
            { name: 'Loop', value: q.loopMode, inline: true },
            { name: 'Up next', value: `${q.tracks.length} track(s) · ${formatDuration(queueDuration(q))}`, inline: true },
        )
        .setFooter({ text: `Track ${q.playedCount} this session` })
        .setTimestamp();
    if (track.thumbnail) embed.setThumbnail(track.thumbnail);

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('music_pause').setLabel('Pause').setStyle(ButtonStyle.Secondary).setEmoji('⏯️'),
        new ButtonBuilder().setCustomId('music_skip').setLabel('Skip').setStyle(ButtonStyle.Secondary).setEmoji('⏭️'),
        new ButtonBuilder().setCustomId('music_stop').setLabel('Stop').setStyle(ButtonStyle.Danger).setEmoji('⏹️'),
    );

    channel.send({ embeds: [embed], components: [row], allowedMentions: { parse: [] } }).catch(() => {});
}

/* ------------------------------------------------------------------ *
 * Idle / alone detection
 * ------------------------------------------------------------------ */
function startIdleWatch(q) {
    clearTimers(q);
    q.idleTimer = setInterval(() => checkListeners(q), 15_000);
    q.idleTimer.unref?.();
}

function checkListeners(q) {
    if (q.destroyed || !q.voiceChannelId || !q.guild) return;
    const channel = q.guild.channels?.cache?.get(q.voiceChannelId);
    if (!channel) {
        destroyQueue(q, '👋 That voice channel disappeared, so I left.');
        return;
    }
    // Only the bot is left.
    const humans = channel.members?.filter((m) => !m.user.bot).size ?? 0;
    if (humans === 0) {
        if (q.aloneSince === undefined) q.aloneSince = Date.now();
        if (Date.now() - q.aloneSince >= config.music.idleDisconnectMs) {
            destroyQueue(q, '👋 Nobody was listening, so I left the voice channel.');
        }
    } else {
        q.aloneSince = undefined;
    }
}

function clearTimers(q) {
    if (q.idleTimer) { clearInterval(q.idleTimer); q.idleTimer = null; }
    if (q.emptyTimer) { clearTimeout(q.emptyTimer); q.emptyTimer = null; }
}

/* ------------------------------------------------------------------ *
 * Teardown
 * ------------------------------------------------------------------ */
function destroyQueue(q, reason) {
    if (!q || q.destroyed) return;
    q.destroyed = true;
    clearTimers(q);

    if (reason && q.textChannelId && q.guild) {
        const channel = q.guild.channels?.cache?.get(q.textChannelId);
        channel?.send?.({ content: reason, allowedMentions: { parse: [] } })?.catch?.(() => {});
    }

    try { q.player?.stop(true); } catch { /* already gone */ }
    try { q.subscription?.unsubscribe(); } catch { /* already gone */ }
    try {
        if (q.connection && q.connection.state.status !== VoiceConnectionStatus.Destroyed) q.connection.destroy();
    } catch { /* already gone */ }

    q.tracks = [];
    q.current = null;
    q.player = null;
    q.subscription = null;
    q.connection = null;
    queues.delete(q.guildId);
}

/** Shut every queue down — called from the SIGINT/SIGTERM handlers in index.js. */
function destroyAll(reason = 'Shutting down.') {
    for (const q of [...queues.values()]) destroyQueue(q, null);
    if (sweepTimer) { clearInterval(sweepTimer); sweepTimer = null; }
    if (reason) console.log(`[music] ${reason} All queues destroyed.`);
}

/** Periodic safety net for queues whose guild object went stale. */
function startSweep() {
    if (sweepTimer) return;
    sweepTimer = setInterval(() => {
        for (const q of [...queues.values()]) {
            const gone = !q.guild || q.guild.available === false;
            const connectionDead = q.connection && q.connection.state.status === VoiceConnectionStatus.Destroyed;
            if (gone || (connectionDead && !q.current && !q.tracks.length)) destroyQueue(q, null);
        }
    }, HARD.sweepIntervalMs);
    sweepTimer.unref?.();
}

/* ------------------------------------------------------------------ *
 * Public API used by commands/music.js
 * ------------------------------------------------------------------ */
/**
 * Add tracks and start playing if idle.
 * @returns {Promise<{ok:boolean, added?:number, error?:string, nowPlaying?:object}>}
 */
async function enqueue({ interaction, query, force = false }) {
    if (!config.music.enabled) return { ok: false, error: 'Music is disabled on this bot (`MUSIC_ENABLED=false`).' };

    // Async on purpose: this is the check that has to be right.
    const ready = await voiceReadyAsync();
    if (!ready.ok) {
        return {
            ok: false,
            error: `The voice stack is incomplete — missing ${ready.missing.join(', ')}. `
                + 'Run `npm install` (or `npm rebuild`) on the host, or set `MUSIC_ENABLED=false` to hide the feature.',
        };
    }

    const ctx = checkVoiceContext(interaction);
    if (!ctx.ok) return { ok: false, error: ctx.error };

    // Per-member throttle, so one person cannot flood the queue with searches.
    if (!force && config.music.playCooldownMs > 0) {
        const remaining = playCooldown.remaining(interaction.user.id);
        if (remaining > 0) {
            return { ok: false, error: `Slow down — you can queue another track in ${(remaining / 1000).toFixed(1)}s.` };
        }
    }

    const q = ensureQueue(interaction.guildId);
    q.guild = interaction.guild;
    q.textChannelId = interaction.channelId;

    if (q.tracks.length >= config.music.maxQueueLength) {
        return { ok: false, error: `The queue is full (${config.music.maxQueueLength} tracks). Wait for it to drain.` };
    }

    const resolved = await resolveQuery(query, interaction.user.id);
    if (resolved.error) return { ok: false, error: resolved.error };

    const room = config.music.maxQueueLength - q.tracks.length - (q.current ? 0 : 1);
    const tracks = resolved.tracks.slice(0, Math.max(1, room));
    q.tracks.push(...tracks);

    // Start the throttle only once the query actually resolved to something, so a
    // typo or a dead link does not cost the user their cooldown.
    if (!force && config.music.playCooldownMs > 0) playCooldown.take(interaction.user.id);

    // Start the pipeline if nothing is playing.
    if (!q.current || q.player?.state?.status === AudioPlayerStatus.Idle) {
        try {
            await connect(q, ctx.channel);
        } catch (error) {
            return { ok: false, error: error.message };
        }
        ensurePlayer(q);
        subscribe(q);
        await playNext(q);
    }

    return { ok: true, added: tracks.length, nowPlaying: q.current, truncated: resolved.truncated, alternatives: resolved.alternatives };
}

function pause(q) {
    if (!q?.player) return false;
    if (q.player.state.status === AudioPlayerStatus.Paused) return false;
    return q.player.pause(true);
}

function resume(q) {
    if (!q?.player) return false;
    if (q.player.state.status === AudioPlayerStatus.Playing) return false;
    return q.player.unpause();
}

/** Skip the current track. Returns what was skipped. */
function skip(q) {
    const was = q?.current || null;
    if (!q?.player) return was;
    // Clear `current` first so a loop-track mode does not replay the skipped song.
    q.current = null;
    q.player.stop(true);   // fires Idle -> playNext()
    return was;
}

function setVolume(q, percent) {
    const value = Math.min(200, Math.max(0, Math.round(Number(percent) || 0)));
    q.volume = value;
    const resource = q.player?.state?.resource;
    resource?.volume?.setVolume(Math.min(2, value / 100));
    return value;
}

function setLoop(q, mode) {
    if (!LOOP_MODES.includes(mode)) return q.loopMode;
    q.loopMode = mode;
    return q.loopMode;
}

/** Fisher-Yates over the pending tracks only — the current track is left alone. */
function shuffle(q, seedUserId) {
    const list = q.tracks;
    if (list.length < 2) return 0;
    // A tiny deterministic-ish mixer so the same requester shuffling twice in a row
    // still gets a different order.
    let seed = (seedUserId || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) + Date.now();
    for (let i = list.length - 1; i > 0; i--) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        const j = seed % (i + 1);
        [list[i], list[j]] = [list[j], list[i]];
    }
    return list.length;
}

function remove(q, position) {
    const index = Number(position) - 1;
    if (!Number.isInteger(index) || index < 0 || index >= q.tracks.length) return null;
    return q.tracks.splice(index, 1)[0];
}

function clear(q) {
    const count = q.tracks.length;
    q.tracks = [];
    return count;
}

/** Full status snapshot, for /music queue and /music nowplaying. */
function describe(q) {
    if (!q) return null;
    const elapsed = q.current && q.startedAt ? Math.floor((Date.now() - q.startedAt) / 1000) : 0;
    return {
        current: q.current,
        elapsed,
        remaining: q.current ? Math.max(0, (q.current.durationSec || 0) - elapsed) : 0,
        tracks: q.tracks,
        queuedDuration: queueDuration(q),
        loopMode: q.loopMode,
        volume: q.volume,
        playedCount: q.playedCount,
        voiceChannelId: q.voiceChannelId,
        textChannelId: q.textChannelId,
        status: q.player?.state?.status || 'idle',
    };
}

/** Progress bar for the now-playing embed. */
function progressBar(q, width = 16) {
    if (!q?.current?.durationSec) return '▬'.repeat(width);
    const ratio = Math.min(1, Math.max(0, (Date.now() - q.startedAt) / 1000 / q.current.durationSec));
    const knob = Math.round(ratio * (width - 1));
    return '▬'.repeat(knob) + '🔘' + '▬'.repeat(width - 1 - knob);
}

module.exports = {
    // lifecycle
    enqueue, destroyQueue, destroyAll, startSweep,
    // transport
    playNext, pause, resume, skip, setVolume, setLoop, shuffle, remove, clear,
    // introspection
    getQueue, ensureQueue, describe, progressBar, queueDuration,
    // helpers also used by tests
    formatDuration, parseDuration, isYouTubeUrl, isPlaylistUrl, voiceReady, dependencyReport, escapeMd, trackLine,
    canRequire, resolveFfmpeg, voiceReadyAsync, OPUS_ENCODERS, CRYPTO_LIBS,
    LOOP_MODES, HARD, queues,
};
