/**
 * Helper role setup.
 *
 * SECURITY FIX: the original auto-created a "Helper" role and granted it to a
 * HARDCODED user ID on every single boot, with no admin action and no audit
 * trail. If that account were ever compromised, sold, or banned, the attacker
 * would silently inherit staff role on the next restart.
 *
 * That behaviour is now DISABLED by default. Promotion is an explicit act:
 *   • an admin runs /promote (see commands/promote.js), or
 *   • you deliberately re-enable the legacy behaviour with
 *     AUTO_HELPER_ENABLED=true + HELPER_MEMBER_ID in .env.
 *
 * Other fixes:
 *  • Guild is resolved by GUILD_ID rather than `guilds.cache.first()`, which
 *    silently targeted a random server once the bot joined a second one.
 *  • Role lookup prefers a configured role ID over a name match.
 *  • Idempotent and fully logged.
 */
const { Events, EmbedBuilder } = require('discord.js');
const config = require('../lib/config');
const roles = require('../lib/roles');

module.exports = {
    name: Events.ClientReady,
    once: true,

    async execute(client) {
        if (!config.autoHelperEnabled) {
            console.log('[helperSetup] auto-promotion is disabled (use /promote). Set AUTO_HELPER_ENABLED=true to restore legacy behaviour.');
            return;
        }
        if (!config.autoHelperMemberId) {
            console.warn('[helperSetup] AUTO_HELPER_ENABLED=true but HELPER_MEMBER_ID is not set — skipping.');
            return;
        }

        // Explicit guild, not "whichever one happens to be first in cache".
        const guild = config.guildId
            ? await client.guilds.fetch(config.guildId).catch(() => null)
            : client.guilds.cache.first();

        if (!guild) {
            console.warn('[helperSetup] no guild available yet — will not retry.');
            return;
        }

        try {
            const member = await guild.members.fetch(config.autoHelperMemberId).catch(() => null);
            if (!member) {
                console.log('[helperSetup] configured helper member is not in the server.');
                return;
            }

            const helperRole = await roles.getOrCreateRole(guild, {
                id: config.roles.helperId,
                name: config.roles.helperName,
                color: '#0055ff',
                reason: 'Automatic Helper role (legacy behaviour, explicitly enabled)',
            });

            if (!helperRole) {
                console.error('[helperSetup] could not find or create the Helper role.');
                return;
            }

            if (member.roles.cache.has(helperRole.id)) {
                console.log(`[helperSetup] ${member.user.tag} already has ${helperRole.name}.`);
                return;
            }

            // Refuse to promote someone who outranks the bot.
            if (helperRole.position >= guild.members.me.roles.highest.position) {
                console.error('[helperSetup] my highest role is not above the Helper role — cannot assign it.');
                return;
            }

            await member.roles.add(helperRole, 'Legacy auto-promotion (AUTO_HELPER_ENABLED)');
            console.log(`[helperSetup] ✅ assigned ${helperRole.name} to ${member.user.tag}`);

            const embed = new EmbedBuilder()
                .setColor(0x0055ff)
                .setTitle('🛡️ Staff promotion')
                .setDescription(`${member} was granted the **${helperRole.name}** role.`)
                .setFooter({ text: 'Triggered by AUTO_HELPER_ENABLED' })
                .setTimestamp();

            const announce = await client.channels.fetch(config.channels.helperAnnounce).catch(() => null);
            if (announce && announce.isTextBased()) {
                await announce.send({ embeds: [embed] }).catch(() => {});
            }

            await member.send({
                content: `🎉 You have been granted the **${helperRole.name}** role in ${guild.name}.`,
            }).catch(() => {});
        } catch (error) {
            console.error('[helperSetup] failed:', error.message);
        }
    },
};
