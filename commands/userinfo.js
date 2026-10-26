/**
 * /userinfo — display detailed info about a user.
 */
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const perms = require('../lib/perms');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('userinfo')
        .setDescription('Show information about a user'),

    category: 'General',

    async execute(interaction) {
        const target = interaction.options.getMember('target') || interaction.options.getUser('target');
        if (!target) {
            return interaction.reply({ content: '❌ User not found.', ephemeral: true });
        }

        const user = target;
        const member = interaction.guild ? target.member : null;

        // Build a human-readable permission description
        let permsText = '';
        if (member && member.permissions) {
            const bits = member.permissions;
            const parts = [];
            if (bits.has(require('discord.js').PermissionFlagsBits.Administrator)) parts.push('Administrator');
            if (bits.has(require('discord.js').PermissionFlagsBits.KickMembers)) parts.push('KickMembers');
            if (bits.has(require('discord.js').PermissionFlagsBits.BanMembers)) parts.push('BanMembers');
            if (bits.has(require('discord.js').PermissionFlagsBits.ManageMessages)) parts.push('ManageMessages');
            if (bits.has(require('discord.js').PermissionFlagsBits.ManageRoles)) parts.push('ManageRoles');
            if (bits.has(require('discord.js').PermissionFlagsBits.ManageGuild)) parts.push('ManageGuild');
            if (bits.has(require('discord.js').PermissionFlagsBits.ModerateMembers)) parts.push('ModerateMembers');
            if (bits.has(require('discord.js').PermissionFlagsBits.ViewChannel)) parts.push('ViewChannel');
            permsText = parts.length ? parts.join(' + ') : 'No special permissions';
        }

        const roles = member ? [...member.roles.cache].map(r => r.name).filter(Boolean).slice(0, 10) : [];
        const joinedAt = user.createdAt || (member && member.joinedAt) || null;

        const embed = new EmbedBuilder()
            .setColor(user.bot ? 0xff69b4 : 0x2f3136)
            .setThumbnail(user.avatarURL({ dynamic: true }) || undefined)
            .setTitle(`${user.username}#${user.discriminator}`)
            .setDescription(`${user.bio || '@User is offline'}`)
            .addFields(
                { name: 'Profile', value: `\`${user.id}\``, inline: true },
                { name: 'Joined', value: joinedAt ? `<t:${Math.floor(new Date(joinedAt).getTime() / 1000)}:D>` : '', inline: true },
                { name: 'Username', value: user.username, inline: true },
                { name: 'Discriminator', value: `#${user.discriminator}`, inline: true },
                { name: 'Tag', value: `${user.tag} (${user.toString()})`, inline: true },
                { name: 'Roles', value: roles.length ? roles.join(', ') : '❌ Not in this server', inline: true },
                { name: 'Permissions', value: permsText, inline: true },
                { name: 'Bot Status', value: user.bot ? '🤖 Bot' : 'User', inline: true },
            )
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    },
};