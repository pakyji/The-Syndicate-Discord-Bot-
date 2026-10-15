/**
 * /promote — explicitly grant a staff role to a member.
 *
 * This replaces the silent auto-promotion that used to run on every boot from
 * events/helperSetup.js. Promotion is now an admin action with an audit reason.
 */
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const perms = require('../lib/perms');
const roles = require('../lib/roles');
const config = require('../lib/config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('promote')
        .setDescription('Grant a staff role to a member')
        .addUserOption((option) => option
            .setName('member')
            .setDescription('The member to promote')
            .setRequired(true))
        .addRoleOption((option) => option
            .setName('role')
            .setDescription('Role to grant (defaults to the configured Helper role)')
            .setRequired(false))
        .addStringOption((option) => option
            .setName('reason')
            .setDescription('Reason for the promotion')
            .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false),

    category: 'Admin',

    async execute(interaction) {
        if (!(await perms.requirePermission(interaction, PermissionFlagsBits.Administrator))) return;

        const target = interaction.options.getMember('member');
        const reason = (interaction.options.getString('reason') || 'Staff promotion').slice(0, 400);

        if (!target) {
            return interaction.reply({ content: '❌ That member could not be found in this server.', ephemeral: true });
        }

        let role = interaction.options.getRole('role');
        if (!role) {
            role = await roles.getOrCreateRole(interaction.guild, {
                id: config.roles.helperId,
                name: config.roles.helperName,
                color: '#0055ff',
                reason: `Created by /promote (${interaction.user.tag})`,
            });
        }
        if (!role) {
            return interaction.reply({
                content: '❌ Could not resolve a role. Pass one explicitly with the `role` option.',
                ephemeral: true,
            });
        }

        // Never let the bot hand out a role at or above its own — that is how
        // an escalation to Administrator happens.
        if (role.position >= interaction.guild.members.me.roles.highest.position) {
            return interaction.reply({
                content: `❌ **${role.name}** is at or above my highest role, so I cannot grant it. Move my role up first.`,
                ephemeral: true,
            });
        }
        if (role.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({
                content: `❌ **${role.name}** has Administrator. Refusing to grant it via this command.`,
                ephemeral: true,
            });
        }
        if (target.roles.cache.has(role.id)) {
            return interaction.reply({ content: `ℹ️ ${target} already has **${role.name}**.`, ephemeral: true });
        }

        try {
            await target.roles.add(role, `${reason} — by ${interaction.user.tag}`);
        } catch (error) {
            console.error('[promote] failed:', error.message);
            return interaction.reply({ content: '❌ Failed to add the role. Check my permissions and role position.', ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setColor(0x00ff7f)
            .setTitle('🛡️ Member promoted')
            .addFields(
                { name: 'Member', value: `${target} (\`${target.id}\`)`, inline: true },
                { name: 'Role', value: role.name, inline: true },
                { name: 'By', value: interaction.user.tag, inline: true },
                { name: 'Reason', value: reason },
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
        await target.send({
            content: `🎉 You have been granted the **${role.name}** role in ${interaction.guild.name}.`,
        }).catch(() => {});
    },
};
