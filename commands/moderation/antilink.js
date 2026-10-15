/**
 * /antilink — toggle link filtering and manage the blocklist.
 *
 * Fixes vs. the original:
 *  • Settings are now PER-GUILD. The original wrote a single global
 *    securityStorage.json, so one server turning anti-link off disabled it for
 *    every server the bot was in.
 *  • Atomic store writes instead of bare fs.writeFileSync (a crash mid-write
 *    used to corrupt the file and take the whole filter down).
 *  • Added `remove` and `list` subcommands — previously entries could only ever
 *    be added, with no way to undo a typo except editing the JSON by hand.
 *  • Added a runtime permission check (registration alone is not a boundary).
 *  • Input is validated and length-capped so a blocklist cannot be grown without
 *    limit or poisoned with an empty string.
 */
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const store = require('../../lib/data');
const perms = require('../../lib/perms');

const MAX_ENTRIES = 100;
const MAX_ENTRY_LENGTH = 100;

function normaliseDomain(input) {
    return String(input || '')
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .replace(/\/.*$/, '')
        .slice(0, MAX_ENTRY_LENGTH);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('antilink')
        .setDescription('Manage anti-link protection and the blocklist')
        .addSubcommand((sub) => sub
            .setName('toggle')
            .setDescription('Turn anti-link protection on or off')
            .addStringOption((option) => option
                .setName('status')
                .setDescription('ON or OFF')
                .setRequired(true)
                .addChoices({ name: 'On', value: 'on' }, { name: 'Off', value: 'off' })))
        .addSubcommand((sub) => sub
            .setName('add')
            .setDescription('Add a domain to the blocklist')
            .addStringOption((option) => option
                .setName('domain')
                .setDescription('Domain to block (e.g. scamlink.com)')
                .setRequired(true)))
        .addSubcommand((sub) => sub
            .setName('remove')
            .setDescription('Remove a domain from the blocklist')
            .addStringOption((option) => option
                .setName('domain')
                .setDescription('Domain to unblock')
                .setRequired(true)))
        .addSubcommand((sub) => sub
            .setName('list')
            .setDescription('Show the current blocklist and status'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false),

    category: 'Moderation',

    async execute(interaction) {
        if (!(await perms.requirePermission(interaction, PermissionFlagsBits.ManageGuild))) return;

        const guildId = interaction.guild.id;
        const sub = interaction.options.getSubcommand();
        const settings = store.getGuild(guildId);

        if (sub === 'toggle') {
            const enabled = interaction.options.getString('status') === 'on';
            await store.updateGuild(guildId, (g) => { g.antiLink = enabled; });

            const embed = new EmbedBuilder()
                .setColor(enabled ? 0x00ff00 : 0xff0000)
                .setTitle('🛡️ Anti-Link Updated')
                .setDescription(`Link filtering is now **${enabled ? 'ON' : 'OFF'}** in this server.`)
                .setTimestamp();

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (sub === 'add') {
            const domain = normaliseDomain(interaction.options.getString('domain'));
            if (!domain) {
                return interaction.reply({ content: '❌ Please provide a valid domain.', ephemeral: true });
            }
            if ((settings.blockedLinks || []).length >= MAX_ENTRIES) {
                return interaction.reply({ content: `❌ The blocklist is full (${MAX_ENTRIES} entries).`, ephemeral: true });
            }
            if ((settings.blockedLinks || []).includes(domain)) {
                return interaction.reply({ content: `⚠️ \`${domain}\` is already blocked.`, ephemeral: true });
            }

            await store.updateGuild(guildId, (g) => {
                if (!Array.isArray(g.blockedLinks)) g.blockedLinks = [];
                g.blockedLinks.push(domain);
            });

            return interaction.reply({
                content: `✅ Added \`${domain}\` to the link blocklist.`,
                ephemeral: true,
            });
        }

        if (sub === 'remove') {
            const domain = normaliseDomain(interaction.options.getString('domain'));
            const list = settings.blockedLinks || [];
            if (!list.includes(domain)) {
                return interaction.reply({ content: `⚠️ \`${domain}\` is not in the blocklist.`, ephemeral: true });
            }

            await store.updateGuild(guildId, (g) => {
                g.blockedLinks = (g.blockedLinks || []).filter((d) => d !== domain);
            });

            return interaction.reply({ content: `✅ Removed \`${domain}\` from the blocklist.`, ephemeral: true });
        }

        // list
        const current = store.getGuild(guildId);
        const embed = new EmbedBuilder()
            .setColor(current.antiLink ? 0x00ff00 : 0xff0000)
            .setTitle('🛡️ Anti-Link Status')
            .setDescription(`Filtering: **${current.antiLink ? 'ON' : 'OFF'}**`)
            .addFields({
                name: `Blocked domains (${(current.blockedLinks || []).length})`,
                value: (current.blockedLinks || []).length
                    ? (current.blockedLinks || []).map((d) => `\`${d}\``).join(', ').slice(0, 1024)
                    : '*None*',
            })
            .setTimestamp();

        return interaction.reply({ embeds: [embed], ephemeral: true });
    },
};
