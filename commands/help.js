/**
 * /help — list every command, grouped by category.
 *
 * Converted from the legacy `{name, execute}` shape (which registered with zero
 * options and skipped the permission metadata) to a proper SlashCommandBuilder.
 *
 * Improvements:
 *  • Permission-gated commands are marked, so a member does not see a list of
 *    commands they cannot use and assume the bot is broken.
 *  • Commands the caller cannot run are hidden entirely when `all:false`.
 *  • Embed field values are chunked at Discord's 1024-character limit and the
 *    total embed is kept under 6000 characters (the original chunked fields but
 *    not the whole embed, so a large command list would be rejected by the API).
 *  • Subcommand list is shown for commands that have them.
 */
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const perms = require('../lib/perms');

const MAX_FIELD_VALUE = 1024;
const MAX_EMBED_TOTAL = 6000;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('List all commands, grouped by category')
        .addStringOption((option) => option
            .setName('command')
            .setDescription('Show details for one command')
            .setRequired(false))
        .addBooleanOption((option) => option
            .setName('all')
            .setDescription('Also show commands you do not have permission to use')
            .setRequired(false)),

    category: 'General',

    async execute(interaction) {
        const client = interaction.client;
        if (!client || !client.commands) {
            return interaction.reply({ content: '❌ Command registry is not available.', ephemeral: true });
        }

        const showAll = interaction.options.getBoolean('all') === true;
        const specific = interaction.options.getString('command');

        /* ── Single-command detail ───────────────────────────── */
        if (specific) {
            const cmd = client.commands.get(specific.toLowerCase());
            if (!cmd) {
                return interaction.reply({
                    content: `❌ No command named \`${specific}\`. Run \`/help\` for the full list.`,
                    ephemeral: true,
                });
            }

            const json = cmd.data
                ? (typeof cmd.data.toJSON === 'function' ? cmd.data.toJSON() : cmd.data)
                : cmd;

            const required = perms.COMMAND_PERMISSIONS[json.name];
            const options = (json.options || [])
                .map((o) => `\`${o.name}\`${o.required ? ' (required)' : ''} — ${o.description || ''}`)
                .join('\n') || '*No options*';

            const embed = new EmbedBuilder()
                .setColor(0x5865f2)
                .setTitle(`/${json.name}`)
                .setDescription(json.description || 'No description.')
                .addFields(
                    { name: 'Category', value: cmd.category || 'General', inline: true },
                    {
                        name: 'Permission',
                        value: required ? perms.describePermission(required) : 'Everyone',
                        inline: true,
                    },
                    { name: 'Options', value: options.slice(0, MAX_FIELD_VALUE) },
                )
                .setTimestamp();

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        /* ── Full list ───────────────────────────────────────── */
        const canRun = (name) => {
            const required = perms.COMMAND_PERMISSIONS[name];
            if (!required) return true;
            if (!interaction.inGuild() || !interaction.member) return false;
            return interaction.member.permissions.has(required);
        };

        const categories = new Map();
        const seen = new Set();

        client.commands.forEach((cmd) => {
            const json = cmd.data
                ? (typeof cmd.data.toJSON === 'function' ? cmd.data.toJSON() : cmd.data)
                : cmd;

            const name = json.name;
            if (!name || seen.has(name)) return;
            seen.add(name);

            const gated = Boolean(perms.COMMAND_PERMISSIONS[name]);
            if (gated && !showAll && !canRun(name)) return;

            const category = cmd.category || 'General';
            if (!categories.has(category)) categories.set(category, []);

            const marker = gated ? ' 🔒' : '';
            categories.get(category).push(`\`/${name}\`${marker} — ${json.description || cmd.description || 'No description'}`);
        });

        const embed = new EmbedBuilder()
            .setColor(0x2f3136)
            .setTitle('The Syndicate • Commands')
            .setDescription('🔒 = restricted. Use `/help command:<name>` for details, or `all:true` to see everything.')
            .setTimestamp();

        let total = 0;
        for (const [category, lines] of [...categories.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
            if (!lines.length) continue;

            // Chunk each category at the 1024-char field limit.
            let chunk = '';
            let part = 1;
            for (const line of lines) {
                if ((chunk + '\n' + line).length > MAX_FIELD_VALUE) {
                    if (total + chunk.length > MAX_EMBED_TOTAL) break;
                    embed.addFields({ name: part === 1 ? category : `${category} (pt ${part})`, value: chunk.trim(), inline: false });
                    total += chunk.length;
                    chunk = line;
                    part += 1;
                } else {
                    chunk += (chunk ? '\n' : '') + line;
                }
            }
            if (chunk.trim() && total + chunk.length <= MAX_EMBED_TOTAL) {
                embed.addFields({ name: part === 1 ? category : `${category} (pt ${part})`, value: chunk.trim(), inline: false });
                total += chunk.length;
            }
        }

        embed.setFooter({ text: `${seen.size} commands loaded` });

        return interaction.reply({ embeds: [embed], ephemeral: true });
    },
};
