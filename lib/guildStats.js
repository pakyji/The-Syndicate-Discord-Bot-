/**
 * Shared server-stats voice channel.
 *
 * This logic was duplicated verbatim in events/guildMemberAdd.js and
 * events/guildMemberRemove.js, and the two copies identified the stats channel
 * purely by an emoji-prefixed NAME — so renaming it (or a member creating a
 * decoy channel called "📊 Members: 999") broke the counter or created a second
 * one. The channel ID is now recorded in the store and only falls back to a name
 * match for channels created by older versions.
 */
const { ChannelType, PermissionFlagsBits } = require('discord.js');
const store = require('./data');

const LEGACY_PREFIX = '📊 Members:';
/** Discord's per-guild channel cap is 500; leave headroom. */
const CHANNEL_CAP = 480;

async function findStatsChannel(guild) {
    const savedId = store.getGuild(guild.id).statsChannelId;
    if (savedId) {
        const channel = guild.channels.cache.get(savedId)
            || await guild.channels.fetch(savedId).catch(() => null);
        if (channel && channel.type === ChannelType.GuildVoice) return channel;
    }

    // Fall back to the legacy name match so pre-existing channels are adopted.
    const legacy = guild.channels.cache.find(
        (c) => c.type === ChannelType.GuildVoice && c.name.startsWith(LEGACY_PREFIX),
    );
    if (legacy) {
        await store.updateGuild(guild.id, (g) => { g.statsChannelId = legacy.id; });
    }
    return legacy || null;
}

async function updateOrCreateServerStats(guild) {
    let channel = await findStatsChannel(guild);
    const desiredName = `${LEGACY_PREFIX} ${guild.memberCount}`;

    if (channel) {
        if (channel.name !== desiredName) {
            await channel.setName(desiredName).catch(() => {});
        }
        return channel;
    }

    if (guild.channels.cache.size >= CHANNEL_CAP) {
        console.warn(`[stats] ${guild.name} is near the ${CHANNEL_CAP}-channel limit — skipping stats channel creation.`);
        return null;
    }

    try {
        channel = await guild.channels.create({
            name: desiredName,
            type: ChannelType.GuildVoice,
            position: 0,
            permissionOverwrites: [
                { id: guild.id, deny: [PermissionFlagsBits.Connect] },
            ],
            reason: 'Server member counter',
        });
        await store.updateGuild(guild.id, (g) => { g.statsChannelId = channel.id; });
        return channel;
    } catch (error) {
        console.error('[stats] failed to create stats channel:', error.message);
        return null;
    }
}

module.exports = { updateOrCreateServerStats, findStatsChannel, LEGACY_PREFIX };
