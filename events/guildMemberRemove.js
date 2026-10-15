/**
 * Member leave handling.
 *
 * Fixes vs. the original:
 *  • Hardcoded goodbye channel ID ('901709744421629972') moved to config.
 *  • The stats-channel logic was duplicated verbatim from guildMemberAdd.js, and
 *    the two copies could drift (one already renamed the channel differently).
 *    Both now call the shared helper in lib/guildStats.js.
 *  • `member.user.tag` is deprecated in discord.js v14 — it returns
 *    `username#0` for users already migrated to the new username system, so
 *    goodbye messages showed a broken discriminator. Now uses `username`.
 *  • The channel lookup only checked the cache, so a goodbye message was silently
 *    skipped whenever the channel was not cached.
 *  • Optionally cleans up the member's leftover verify- channel.
 */
const { Events, EmbedBuilder } = require('discord.js');
const config = require('../lib/config');
const { updateOrCreateServerStats } = require('../lib/guildStats');

module.exports = {
    name: Events.GuildMemberRemove,

    async execute(member) {
        const guild = member.guild;

        try {
            await updateOrCreateServerStats(guild);

            /* Goodbye message */
            if (config.channels.goodbye) {
                const channel = guild.channels.cache.get(config.channels.goodbye)
                    || await guild.channels.fetch(config.channels.goodbye).catch(() => null);

                if (channel && channel.isTextBased()) {
                    const embed = new EmbedBuilder()
                        .setColor(0xff0000)
                        .setTitle('🚪 Member Left')
                        .setDescription(`**${member.user.username}** has left the server.`)
                        .setThumbnail(member.user.displayAvatarURL({ extension: 'png', size: 128 }))
                        .addFields(
                            { name: 'Remaining members', value: `${guild.memberCount}`, inline: true },
                            { name: 'User ID', value: `\`${member.id}\``, inline: true },
                        )
                        .setTimestamp();

                    await channel.send({ embeds: [embed] }).catch((error) => {
                        console.error('[leave] goodbye message failed:', error.message);
                    });
                }
            }

            /* Clean up their verification channel if it is still open */
            const leftover = guild.channels.cache.find(
                (c) => c.name.startsWith('verify-') && c.topic && c.topic.includes(member.id),
            );
            if (leftover) {
                await leftover.delete('Member left the server').catch(() => {});
            }
        } catch (error) {
            console.error('[leave] guildMemberRemove failed:', error.message);
        }
    },
};
