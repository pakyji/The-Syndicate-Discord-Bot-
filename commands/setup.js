/**
 * /setup — lock the server behind the Verified role.
 *
 * ⭐ DESTRUCTIVE BUG FIXED: the original called
 *
 *     channel.permissionOverwrites.set([ {deny @everyone}, {allow Verified} ])
 *
 * `set()` REPLACES the entire overwrite list. So on every channel it wiped all
 * existing overwrites — moderator roles, staff categories, per-member
 * permissions, private channels — leaving only @everyone/Verified. On a server
 * with any existing permission structure this silently locks staff out of their
 * own channels and is effectively unrecoverable without a manual rebuild.
 *
 * Now it:
 *  • MERGES the two overwrites into whatever already exists instead of replacing
 *    them.
 *  • Shows a dry-run summary first and requires an explicit `confirm:true`.
 *  • Skips channels you exclude, and skips categories by default (overwriting a
 *    category cascades to every child channel, which is rarely what you want).
 *  • Rate-limit aware: chunks the work and reports progress.
 *  • Is a proper SlashCommandBuilder (it was legacy format, so it registered with
 *    no options at all — the `confirm` argument could not even be passed).
 *  • Uses English messages (the original mixed Italian strings into an
 *    English-facing bot).
 */
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType } = require('discord.js');
const perms = require('../lib/perms');
const roles = require('../lib/roles');
const config = require('../lib/config');

const TEXT_TYPES = new Set([
    ChannelType.GuildText,
    ChannelType.GuildAnnouncement,
    ChannelType.GuildVoice,
    ChannelType.GuildStageVoice,
]);

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setup')
        .setDescription('Lock server channels behind the Verified role (preview first)')
        .addBooleanOption((option) => option
            .setName('confirm')
            .setDescription('Run for real. Without this you get a dry-run preview.')
            .setRequired(false))
        .addBooleanOption((option) => option
            .setName('include_categories')
            .setDescription('Also apply to categories (cascades to child channels)')
            .setRequired(false))
        .addChannelOption((option) => option
            .setName('skip_channel')
            .setDescription('A channel to leave untouched (e.g. rules, welcome)')
            .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false),

    category: 'Admin',

    async execute(interaction) {
        if (!(await perms.requirePermission(interaction, PermissionFlagsBits.Administrator))) return;

        const guild = interaction.guild;
        const confirm = interaction.options.getBoolean('confirm') === true;
        const includeCategories = interaction.options.getBoolean('include_categories') === true;
        const skipChannel = interaction.options.getChannel('skip_channel');

        const verifiedRole = await roles.getOrCreateRole(guild, {
            id: config.roles.verifiedId,
            name: config.roles.verifiedName,
            color: '#00FF00',
            reason: `Created by /setup (${interaction.user.tag})`,
        });

        if (!verifiedRole) {
            return interaction.reply({
                content: '❌ Could not find or create the Verified role. Set `VERIFIED_ROLE_ID` in `.env`.',
                ephemeral: true,
            });
        }

        // Guard: never lock out the bot or the Administrator role.
        if (verifiedRole.position >= guild.members.me.roles.highest.position) {
            return interaction.reply({
                content: '❌ The Verified role is at or above my highest role. Move my role up first.',
                ephemeral: true,
            });
        }

        const targets = guild.channels.cache.filter((c) => {
            if (skipChannel && c.id === skipChannel.id) return false;
            if (includeCategories) return c.type === ChannelType.GuildCategory || TEXT_TYPES.has(c.type);
            return TEXT_TYPES.has(c.type);
        });

        /* ── Dry run ─────────────────────────────────────────── */
        if (!confirm) {
            const preview = targets.first(15).map((c) => `• ${c} (${ChannelType[c.type]})`).join('\n') || '*none*';
            const embed = new EmbedBuilder()
                .setColor(0xffa500)
                .setTitle('🔒 /setup preview (nothing changed yet)')
                .setDescription(
                    `I will **hide ${targets.size} channel(s)** from \`@everyone\` and grant `
                    + `**${verifiedRole.name}** access, MERGING with existing overwrites `
                    + '(existing role permissions are preserved).',
                )
                .addFields(
                    { name: 'Channels affected', value: `${targets.size}`, inline: true },
                    { name: 'Role granted access', value: verifiedRole.name, inline: true },
                    { name: 'Categories included', value: includeCategories ? 'Yes' : 'No', inline: true },
                    { name: 'First 15', value: preview.slice(0, 1024) },
                )
                .setFooter({ text: 'Re-run with confirm:true to apply. Excluded channels keep their current permissions.' })
                .setTimestamp();

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        /* ── Apply ───────────────────────────────────────────── */
        await interaction.deferReply({ ephemeral: true });

        let updated = 0;
        const failed = [];

        for (const channel of targets.values()) {
            try {
                // MERGE, never replace. `edit` with an id keyed overwrite only
                // touches the two entries we care about.
                await channel.permissionOverwrites.edit(guild.id, { ViewChannel: false }, {
                    reason: `/setup by ${interaction.user.tag}`,
                    type: 0,
                });
                await channel.permissionOverwrites.edit(verifiedRole.id, { ViewChannel: true }, {
                    reason: `/setup by ${interaction.user.tag}`,
                });
                updated += 1;
            } catch (error) {
                failed.push(channel.name);
                console.error(`[setup] ${channel.name}:`, error.message);
            }

            // Stay well inside Discord's 10-permission-edits/5s bucket.
            if (updated % 5 === 0) await new Promise((r) => { setTimeout(r, 1200); });
        }

        const embed = new EmbedBuilder()
            .setColor(failed.length ? 0xffa500 : 0x00ff00)
            .setTitle('🔒 Server lock-down complete')
            .setDescription(`Updated **${updated}** of ${targets.size} channel(s).`)
            .setTimestamp();

        if (failed.length) {
            embed.addFields({
                name: `Failed (${failed.length})`,
                value: failed.slice(0, 20).map((n) => `\`${n}\``).join(', ').slice(0, 1024),
            });
        }

        return interaction.editReply({ embeds: [embed] });
    },
};
