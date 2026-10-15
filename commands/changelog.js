/**
 * /changelog — read CHANGELOG.md from inside Discord.
 *
 * The update announcement quotes only the top few items of the newest entry, so
 * this is where the full history lives. It parses the same file lib/version.js
 * uses, which means the announcement and this command can never disagree.
 */
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../lib/config');
const version = require('../lib/version');

/** How many releases to show when no version is requested. */
const RECENT_COUNT = 4;
/** Max bullets per release in the "recent" view. */
const ITEMS_PER_RELEASE = 6;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('changelog')
        .setDescription('Show what changed in recent bot versions')
        .addStringOption((option) => option
            .setName('version')
            .setDescription('A specific version, e.g. 2.1.0 (leave empty for the recent ones)')
            .setMaxLength(20))
        .setDMPermission(false),

    category: 'Utility',

    async execute(interaction) {
        const entries = version.parseChangelog();

        if (!entries.length) {
            return interaction.reply({
                content: '❌ There is no readable `CHANGELOG.md` in this deployment.',
                ephemeral: true,
            });
        }

        const wanted = interaction.options.getString('version');

        /* ---- One specific release ---- */
        if (wanted) {
            const needle = wanted.replace(/^v/i, '').trim();
            const entry = entries.find((e) => e.version === needle);
            if (!entry) {
                const known = entries.slice(0, 10).map((e) => `\`${e.version}\``).join(', ');
                return interaction.reply({
                    content: `❌ No changelog entry for **${wanted}**. Known versions: ${known}`,
                    ephemeral: true,
                });
            }
            const embed = new EmbedBuilder()
                .setColor(0x57f287)
                .setTitle(`📋 v${entry.version}${entry.version === config.version ? ' *(running now)*' : ''}`)
                .setDescription(
                    (entry.items.length
                        ? entry.items.map((i) => `• ${i}`).join('\n')
                        : '*No items recorded for this release.*'
                    ).slice(0, 4000),
                )
                .setFooter({ text: `${entry.items.length} change(s)` })
                .setTimestamp();
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        /* ---- Recent releases ---- */
        const recent = entries.slice(0, RECENT_COUNT);
        const embed = new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle('📋 Recent changes')
            .setDescription(`Running **v${config.version}**${config.commit ? ` (build \`${config.commit}\`)` : ''}.`)
            .setFooter({ text: `${entries.length} release(s) recorded • /changelog version:2.1.0 for one entry` })
            .setTimestamp();

        for (const entry of recent) {
            const items = entry.items.slice(0, ITEMS_PER_RELEASE).map((i) => `• ${i.slice(0, 160)}`);
            if (entry.items.length > ITEMS_PER_RELEASE) {
                items.push(`*…and ${entry.items.length - ITEMS_PER_RELEASE} more*`);
            }
            embed.addFields({
                name: `v${entry.version}${entry.version === config.version ? ' — current' : ''}`,
                value: (items.length ? items.join('\n') : '*No items recorded.*').slice(0, 1024),
                inline: false,
            });
        }

        return interaction.reply({ embeds: [embed], ephemeral: true });
    },
};
