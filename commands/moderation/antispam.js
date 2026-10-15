/**
 * /antispam — toggle the anti-spam / anti-flood filter.
 *
 * Fixes vs. the original:
 *  • The status lived in a module-level `let antiSpamStatus = true`, so it reset
 *    to ON on every restart and nothing else in the codebase ever read it — the
 *    command was cosmetic. It is now persisted per guild in the unified store
 *    and actually consumed by events/antispamListener.js.
 *  • There was NO anti-spam listener at all: the only implementation was the
 *    dead root-level `antispam.js`, which was never imported (and contained its
 *    own `client.login()`). events/antispamListener.js now exists.
 *  • Per-guild instead of global.
 *  • Tunable thresholds and a `status` view.
 */
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const store = require('../../lib/data');
const perms = require('../../lib/perms');
const config = require('../../lib/config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('antispam')
        .setDescription('Manage anti-spam / anti-flood protection')
        .addSubcommand((sub) => sub
            .setName('toggle')
            .setDescription('Turn anti-spam protection on or off')
            .addStringOption((option) => option
                .setName('status')
                .setDescription('ON or OFF')
                .setRequired(true)
                .addChoices({ name: 'On', value: 'on' }, { name: 'Off', value: 'off' })))
        .addSubcommand((sub) => sub
            .setName('config')
            .setDescription('Tune the detection thresholds')
            .addIntegerOption((option) => option
                .setName('limit')
                .setDescription(`Messages allowed in the window (2-20, default ${config.moderation.spamLimit})`)
                .setMinValue(2)
                .setMaxValue(20)
                .setRequired(false))
            .addIntegerOption((option) => option
                .setName('window_seconds')
                .setDescription('Length of the detection window in seconds (2-60)')
                .setMinValue(2)
                .setMaxValue(60)
                .setRequired(false))
            .addIntegerOption((option) => option
                .setName('timeout_seconds')
                .setDescription('Timeout applied on detection (10-600)')
                .setMinValue(10)
                .setMaxValue(600)
                .setRequired(false)))
        .addSubcommand((sub) => sub
            .setName('status')
            .setDescription('Show the current anti-spam configuration'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false),

    category: 'Moderation',

    async execute(interaction) {
        if (!(await perms.requirePermission(interaction, PermissionFlagsBits.ManageGuild))) return;

        const guildId = interaction.guild.id;
        const sub = interaction.options.getSubcommand();

        if (sub === 'toggle') {
            const enabled = interaction.options.getString('status') === 'on';
            await store.updateGuild(guildId, (g) => { g.antiSpam = enabled; });

            const embed = new EmbedBuilder()
                .setColor(enabled ? 0x00ff00 : 0xff0000)
                .setTitle('🛡️ Anti-Spam Updated')
                .setDescription(
                    `Anti-spam protection is now **${enabled ? 'ON' : 'OFF'}** in this server.`
                    + (enabled ? '' : '\n⚠️ The server is now unprotected against message flooding.'),
                )
                .setTimestamp();

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (sub === 'config') {
            const limit = interaction.options.getInteger('limit');
            const windowSeconds = interaction.options.getInteger('window_seconds');
            const timeoutSeconds = interaction.options.getInteger('timeout_seconds');

            if (limit === null && windowSeconds === null && timeoutSeconds === null) {
                return interaction.reply({
                    content: 'ℹ️ Provide at least one option to change. Use `/antispam status` to see current values.',
                    ephemeral: true,
                });
            }

            await store.updateGuild(guildId, (g) => {
                if (limit !== null) g.spamLimit = limit;
                if (windowSeconds !== null) g.spamWindowMs = windowSeconds * 1000;
                if (timeoutSeconds !== null) g.spamTimeoutMs = timeoutSeconds * 1000;
            });

            const updated = store.getGuild(guildId);
            return interaction.reply({
                content: `✅ Anti-spam updated — **${updated.spamLimit ?? config.moderation.spamLimit}** messages per `
                    + `**${Math.round((updated.spamWindowMs ?? config.moderation.spamWindowMs) / 1000)}s**, `
                    + `timeout **${Math.round((updated.spamTimeoutMs ?? config.moderation.spamTimeoutMs) / 1000)}s**.`,
                ephemeral: true,
            });
        }

        // status
        const current = store.getGuild(guildId);
        const embed = new EmbedBuilder()
            .setColor(current.antiSpam ? 0x00ff00 : 0xff0000)
            .setTitle('🛡️ Anti-Spam Status')
            .addFields(
                { name: 'Enabled', value: current.antiSpam ? '✅ Yes' : '❌ No', inline: true },
                { name: 'Message limit', value: `${current.spamLimit ?? config.moderation.spamLimit}`, inline: true },
                { name: 'Window', value: `${Math.round((current.spamWindowMs ?? config.moderation.spamWindowMs) / 1000)}s`, inline: true },
                { name: 'Timeout', value: `${Math.round((current.spamTimeoutMs ?? config.moderation.spamTimeoutMs) / 1000)}s`, inline: true },
                { name: 'Duplicate limit', value: `${config.moderation.duplicateLimit}`, inline: true },
                { name: 'Staff bypass', value: 'Manage Messages', inline: true },
            )
            .setTimestamp();

        return interaction.reply({ embeds: [embed], ephemeral: true });
    },
};
