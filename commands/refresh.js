/**
 * /refresh — re-register this server's slash commands.
 *
 * ⭐ CRITICAL FIX: this command rebuilt the registration payload the same broken
 * way index.js did — `{ name, description, options }` only — and then `PUT` it to
 * Discord. Because PUT *replaces* the entire command list, running /refresh wiped
 * `default_member_permissions` off every command again, re-opening all 18
 * privilege holes even after the index.js fix. It now forwards the permission,
 * dm_permission and nsfw fields exactly like index.js.
 *
 * Other fixes:
 *  • Uses the token from lib/config instead of re-reading process.env.
 *  • Raw `error.message` is no longer echoed back to the user (info leak).
 *  • Reports how many commands are permission-gated so a regression is visible.
 */
const { SlashCommandBuilder, PermissionFlagsBits, REST, Routes } = require('discord.js');
const perms = require('../lib/perms');
const config = require('../lib/config');
const { redact } = require('../lib/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('refresh')
        .setDescription('Re-register slash commands for this server (clears ghosts & duplicates)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false),

    category: 'Admin',

    async execute(interaction) {
        if (!(await perms.requirePermission(interaction, PermissionFlagsBits.Administrator))) return;

        await interaction.deferReply({ ephemeral: true });

        try {
            const client = interaction.client;
            const seen = new Set();
            const payload = [];

            client.commands.forEach((cmd) => {
                const json = cmd.data
                    ? (typeof cmd.data.toJSON === 'function' ? cmd.data.toJSON() : cmd.data)
                    : cmd;

                const name = json.name;
                if (!name || name === 'undefined' || seen.has(name)) return;
                seen.add(name);

                const entry = {
                    name,
                    description: json.description || 'No description provided',
                    options: json.options || [],
                };

                // ⭐ Forward the permission gate — omitting this is what stripped
                //    Administrator/ManageGuild off every command.
                if (json.default_member_permissions != null) {
                    entry.default_member_permissions = String(json.default_member_permissions);
                }
                if (json.dm_permission === false) entry.dm_permission = false;
                if (json.nsfw === true) entry.nsfw = true;

                payload.push(entry);
            });

            const rest = new REST({ version: '10' }).setToken(config.token);

            await rest.put(
                Routes.applicationGuildCommands(client.user.id, interaction.guild.id),
                { body: payload },
            );

            const gated = payload.filter((c) => c.default_member_permissions != null).length;

            await interaction.editReply(
                `✅ Re-registered **${payload.length}** commands for this server `
                + `(**${gated}** permission-gated, ${payload.length - gated} public). `
                + 'Duplicates and ghost commands have been cleared.',
            );
        } catch (error) {
            console.error('[refresh] failed:', redact(error.message || String(error)));
            await interaction.editReply(
                '❌ Failed to refresh commands. Check the console for details '
                + '(common cause: the bot token lacks the `applications.commands` scope).',
            );
        }
    },
};
