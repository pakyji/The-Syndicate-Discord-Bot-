const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const { Cooldowns } = require('../lib/cooldowns');

// Reports are DM'd to every staff member, so an unthrottled /report is a
// staff-DM spam tool. One report per member per 60s.
const reportCooldowns = new Cooldowns(60 * 1000, 10000);


module.exports = {
    data: new SlashCommandBuilder()
        .setName('report')
        .setDescription('Open the secure reporting center form.'),

    async execute(interaction) {
        if (!reportCooldowns.take(interaction.user.id)) {
            const wait = Math.ceil(reportCooldowns.remaining(interaction.user.id) / 1000);
            return interaction.reply({
                content: `⏳ You already opened the report form recently. Try again in **${wait}s**.`,
                ephemeral: true,
            });
        }

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('report_category_select')
            .setPlaceholder('📌 Select a Report Category...')
            .addOptions([
                {
                    label: 'Report a Scammer',
                    description: 'Report someone for scamming or attempted scamming.',
                    value: 'report_scammer',
                    emoji: '🚨'
                },
                {
                    label: 'Server Rule Violation',
                    description: 'Report harassment, slurs, NSFW, or general rule-breaking.',
                    value: 'report_rule',
                    emoji: '⚠️'
                },
                {
                    label: 'DM Advertising',
                    description: 'Report unsolicited self-promotion or advertising in DMs.',
                    value: 'report_dm',
                    emoji: '📢'
                }
            ]);

        const row = new ActionRowBuilder().addComponents(selectMenu);

        const embed = new EmbedBuilder()
            .setColor(0xFF4500)
            .setTitle('🚨 The Syndicate Reporting Center')
            .setDescription(
                '**Reports without sufficient evidence may be closed.**\n\n' +
                '🔍 **What Can Be Reported?**\n' +
                '• Scamming or attempted scamming\n' +
                '• DM advertising or self-promotion\n' +
                '• Harassment, threats or targeted abuse\n' +
                '• Racism, slurs or discrimination\n' +
                '• Malicious or suspicious links\n' +
                '• NSFW or inappropriate content\n\n' +
                '*Please select a category below to open your report form.*'
            )
            .setFooter({ text: 'Powered by The Syndicate Security' })
            .setTimestamp();

        // Se viene eseguito come comando, invia il pannello pubblico o effimero nel canale
        await interaction.reply({ embeds: [embed], components: [row] });
    }};
