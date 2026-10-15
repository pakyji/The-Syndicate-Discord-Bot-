/**
 * Member join handling.
 *
 * Fixes vs. the original:
 *  • BROKEN INVITE TRACKING — `global.invitesCache || new Map()` was evaluated at
 *    MODULE LOAD TIME, before the client logged in, so it captured a permanent
 *    empty Map. The "Invited By" field therefore always read
 *    "Unknown / Direct Link". Now uses the single shared cache in lib/invites.js.
 *  • Unbounded channel creation: the original created a private `verify-<name>`
 *    channel for EVERY join, with no cap, no rate limit and no cleanup. A
 *    raid-bot join wave would push the guild toward Discord's 500-channel limit
 *    and the bot would then throw on every subsequent join. Now capped, skipped
 *    for bots, and stale channels are pruned.
 *  • Channel names used `user.username`, which can contain characters Discord
 *    rejects; now uses the member's ID-derived slug and is sanitised.
 *  • The "Verified" role was auto-CREATED here. Creating a role on every join
 *    event is unnecessary and lets a decoy role appear; it is now resolved by ID
 *    when configured and never created from a join event.
 *  • Hardcoded welcome channel ID -> config.
 *  • Leftover `[DEBUG]` console.log removed; stats-channel lookup no longer
 *    depends on an emoji prefix that a rename would break (uses a managed name).
 */
const { Events, ChannelType, PermissionFlagsBits, EmbedBuilder,
    ActionRowBuilder, ButtonBuilder, ButtonStyle, } = require('discord.js');
const config = require('../lib/config');
const invites = require('../lib/invites');
const roles = require('../lib/roles');
const { updateOrCreateServerStats } = require('../lib/guildStats');

/** Hard cap on concurrent verification channels, to stop raid-bot channel floods. */
const MAX_VERIFY_CHANNELS = 25;
/** Delete a verification channel that has been open longer than this. */
const STALE_VERIFY_MS = 24 * 60 * 60 * 1000;

/** Remove verify- channels left open by members who already left or verified. */
async function pruneStaleVerifyChannels(guild) {
    const stale = guild.channels.cache.filter(
        (c) => c.name.startsWith('verify-')
            && Date.now() - c.createdTimestamp > STALE_VERIFY_MS,
    );
    for (const channel of stale.values()) {
        await channel.delete('Stale verification channel cleanup').catch(() => {});
    }
    return stale.size;
}

function safeChannelName(user) {
    const base = (user.globalName || user.username || 'user')
        .toLowerCase()
        .replace(/[^a-z0-9-_.]/g, '')
        .slice(0, 20);
    return `verify-${base || 'member'}-${user.id.slice(-4)}`;
}

module.exports = {
    name: Events.GuildMemberAdd,

    async execute(member, client) {
        const guild = member.guild;

        try {
            /* 1. Invite tracking — shared cache, actually works now */
            let inviterText = 'Unknown / Direct Link';
            const { inviter, code } = await invites.findInviter(guild);
            if (inviter) {
                inviterText = `${inviter.tag} (code \`${code}\`)`;
            } else if (code) {
                inviterText = `Vanity / system invite (\`${code}\`)`;
            }

            /* 2. Member counter */
            await updateOrCreateServerStats(guild);

            /* 3. Welcome message */
            const welcomeChannel = guild.channels.cache.get(config.channels.welcome)
                || await guild.channels.fetch(config.channels.welcome).catch(() => null);

            if (welcomeChannel && welcomeChannel.isTextBased()) {
                const welcomeEmbed = new EmbedBuilder()
                    .setColor(0x00ff00)
                    .setTitle('👋 New Member Joined!')
                    .setDescription(`Welcome to **${guild.name}**, ${member}! Glad to have you here.`)
                    .setThumbnail(member.user.displayAvatarURL({ extension: 'png', size: 256 }))
                    .addFields(
                        { name: 'Total Members', value: `${guild.memberCount}`, inline: true },
                        { name: 'Invited By', value: inviterText, inline: true },
                    )
                    .setTimestamp();

                await welcomeChannel.send({ embeds: [welcomeEmbed] }).catch((error) => {
                    console.error('[join] welcome message failed:', error.message);
                });
            }

            /* 4. Verification channel — never for bots, and capped */
            if (member.user.bot) {
                console.log(`[join] bot ${member.user.tag} joined — skipping verification channel.`);
                return;
            }

            const openVerifyChannels = guild.channels.cache.filter((c) => c.name.startsWith('verify-')).size;
            if (openVerifyChannels >= MAX_VERIFY_CHANNELS) {
                console.warn(`[join] ${openVerifyChannels} verification channels already open — skipping creation for ${member.user.tag}.`);
                await pruneStaleVerifyChannels(guild);
                return;
            }

            // Reuse an existing channel for this member instead of making a second one.
            const existing = guild.channels.cache.find((c) => c.name.endsWith(member.id.slice(-4)) && c.name.startsWith('verify-'));
            if (existing) return;

            if (guild.channels.cache.size >= 470) {
                console.warn('[join] guild near channel limit — skipping verification channel.');
                return;
            }

            // Resolve (do not create) the Verified role so the verify buttons have a target.
            const verifiedRole = await roles.getVerifiedRole(guild);
            if (!verifiedRole) {
                console.warn('[join] no Verified role configured/available — verification will not grant access. Set VERIFIED_ROLE_ID in .env.');
            }

            const verificationChannel = await guild.channels.create({
                name: safeChannelName(member.user),
                type: ChannelType.GuildText,
                topic: `Verification for ${member.user.tag} (${member.id})`,
                permissionOverwrites: [
                    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                    {
                        id: member.id,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.ReadMessageHistory,
                        ],
                    },
                    {
                        id: client.user.id,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.ManageChannels,
                        ],
                    },
                ],
                reason: `Verification channel for ${member.user.tag}`,
            });

            const embed = new EmbedBuilder()
                .setColor('#2b2d31')
                .setTitle('The Syndicate Verification')
                .setDescription('Welcome! Click your gaming platform below to unlock the server.');

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('verify_ps4').setLabel('PS4').setStyle(ButtonStyle.Primary).setEmoji('🎮'),
                new ButtonBuilder().setCustomId('verify_ps5').setLabel('PS5').setStyle(ButtonStyle.Primary).setEmoji('🎮'),
                new ButtonBuilder().setCustomId('verify_pc').setLabel('PC').setStyle(ButtonStyle.Success).setEmoji('💻'),
                new ButtonBuilder().setCustomId('verify_nongamer').setLabel('Non-Gamer').setStyle(ButtonStyle.Secondary).setEmoji('👤'),
            );

            await verificationChannel.send({
                content: `Hey ${member}! Welcome to the server.`,
                embeds: [embed],
                components: [row],
            });
        } catch (error) {
            console.error('[join] guildMemberAdd failed:', error.message);
        }
    },
};
