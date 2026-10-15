/**
 * /reactionroles — post the platform self-assign panel.
 *
 * Fixes vs. the original:
 *  • ⭐ It auto-created EIGHT roles on every single run. Running it twice created
 *    duplicates ("PS4", "PS4", ...) because the lookup was case-insensitive by
 *    name but creation was unconditional on any transient failure, and Discord's
 *    hard limit is 250 roles per guild. Role creation is now opt-in via
 *    `create_missing:true` and always reports what it created.
 *  • The target channel was a hardcoded constant with no config fallback and no
 *    SendMessages check.
 *  • Before the permission fix this was Administrator-in-name-only (the gate was
 *    stripped at registration), so any member could spawn 8 roles and post a
 *    panel letting everyone self-assign them. Now gated at registration + runtime.
 *  • Roles at or above the bot's highest role are refused — self-assigning such a
 *    role is a privilege-escalation path.
 *  • The panel now lists which roles are missing instead of silently creating them.
 */
const {
    SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder,
    ButtonBuilder, ButtonStyle, ChannelType,
} = require('discord.js');
const perms = require('../lib/perms');
const config = require('../lib/config');

const PLATFORM_ROLES = [
    { key: 'ps4', name: 'PS4', style: ButtonStyle.Primary, emoji: '🎮' },
    { key: 'ps5', name: 'PS5', style: ButtonStyle.Primary, emoji: '🎮' },
    { key: 'pc', name: 'PC', style: ButtonStyle.Success, emoji: '💻' },
    { key: 'pc_enhanced', name: 'PC Enhanced', style: ButtonStyle.Success, emoji: '⚡' },
    { key: 'xbox', name: 'X Box Series', style: ButtonStyle.Secondary, emoji: '🟩' },
    { key: 'switch', name: 'Switch', style: ButtonStyle.Danger, emoji: '🔴' },
    { key: 'mobile', name: 'Mobile User', style: ButtonStyle.Secondary, emoji: '📱' },
    { key: 'nongamer', name: 'Non Gamer', style: ButtonStyle.Secondary, emoji: '🛑' },
];

const MAX_ROLES_PER_GUILD = 250;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('reactionroles')
        .setDescription('Post the platform self-assign role panel')
        .addChannelOption((option) => option
            .setName('channel')
            .setDescription('Where to post the panel (defaults to the configured PC channel)')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false))
        .addBooleanOption((option) => option
            .setName('create_missing')
            .setDescription('Create any platform roles that do not exist yet')
            .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false),

    category: 'Admin',

    async execute(interaction) {
        if (!(await perms.requirePermission(interaction, PermissionFlagsBits.Administrator))) return;

        const guild = interaction.guild;
        const createMissing = interaction.options.getBoolean('create_missing') === true;

        const targetChannel = interaction.options.getChannel('channel')
            || guild.channels.cache.get(config.channels.pc)
            || await guild.channels.fetch(config.channels.pc).catch(() => null);

        if (!targetChannel || !targetChannel.isTextBased()) {
            return interaction.reply({
                content: '❌ No target channel. Pass the `channel` option or set `PC_CHANNEL_ID` in `.env`.',
                ephemeral: true,
            });
        }
        if (!targetChannel.permissionsFor(guild.members.me).has(PermissionFlagsBits.SendMessages)) {
            return interaction.reply({ content: `❌ I cannot send messages in ${targetChannel}.`, ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        const botTop = guild.members.me.roles.highest.position;
        const missing = [];
        const blocked = [];
        const created = [];

        for (const platform of PLATFORM_ROLES) {
            let role = guild.roles.cache.find((r) => r.name.toLowerCase() === platform.name.toLowerCase());

            if (!role && createMissing) {
                if (guild.roles.cache.size >= MAX_ROLES_PER_GUILD - 1) {
                    blocked.push(`${platform.name} (guild is at Discord's ${MAX_ROLES_PER_GUILD}-role limit)`);
                    continue;
                }
                try {
                    role = await guild.roles.create({
                        name: platform.name,
                        reason: `Created by /reactionroles (${interaction.user.tag})`,
                    });
                    created.push(platform.name);
                } catch (error) {
                    console.error(`[reactionroles] could not create ${platform.name}:`, error.message);
                    blocked.push(platform.name);
                }
            }

            if (!role) {
                missing.push(platform.name);
                continue;
            }

            // A self-assignable role must sit below the bot, or the bot cannot
            // grant it — and granting one at the top is an escalation risk.
            if (role.position >= botTop) blocked.push(`${platform.name} (at/above my highest role)`);
            if (role.permissions.has(PermissionFlagsBits.Administrator)) {
                blocked.push(`${platform.name} (has Administrator)`);
            }
        }

        const embed = new EmbedBuilder()
            .setColor('#7289DA')
            .setTitle('🎮 SYNDICATE — Platform Roles')
            .setDescription(
                'Click the buttons below to add or remove your gaming platform roles.\n\n'
                + '• **PS4** / **PS5**\n• **PC** / **PC Enhanced**\n'
                + '• **Xbox Series** / **Switch**\n• **Mobile User** / **Non Gamer**',
            )
            .setFooter({ text: 'The Syndicate Role System' })
            .setTimestamp();

        const row1 = new ActionRowBuilder().addComponents(
            PLATFORM_ROLES.slice(0, 4).map((p) => new ButtonBuilder()
                .setCustomId(`role_${p.key}`).setLabel(p.name).setStyle(p.style).setEmoji(p.emoji)),
        );
        const row2 = new ActionRowBuilder().addComponents(
            PLATFORM_ROLES.slice(4).map((p) => new ButtonBuilder()
                .setCustomId(`role_${p.key}`).setLabel(p.name).setStyle(p.style).setEmoji(p.emoji)),
        );

        try {
            await targetChannel.send({ embeds: [embed], components: [row1, row2] });
        } catch (error) {
            console.error('[reactionroles] post failed:', error.message);
            return interaction.editReply({ content: `❌ Could not post the panel in ${targetChannel}.` });
        }

        const notes = [`✅ Panel posted in ${targetChannel}.`];
        if (created.length) notes.push(`**Created roles:** ${created.map((n) => `\`${n}\``).join(', ')}`);
        if (missing.length) notes.push(`⚠️ **Missing roles** (buttons will not work for these): ${missing.map((n) => `\`${n}\``).join(', ')} — re-run with \`create_missing:true\`.`);
        if (blocked.length) notes.push(`❌ **Unusable roles:** ${blocked.map((n) => `\`${n}\``).join(', ')}`);

        return interaction.editReply({ content: notes.join('\n').slice(0, 1900) });
    },
};
