const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

const TARGET_CHANNEL_ID = '1553912075494105139';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('report')
        .setDescription('Open the secure reporting center form.'),

    async execute(interaction) {
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
    },

    async handleInteraction(interaction) {
        try {
            if (interaction.isStringSelectMenu() && interaction.customId === 'report_category_select') {
                const selectedValue = interaction.values[0];
                let categoryTitle = 'Report Form';

                if (selectedValue === 'report_scammer') categoryTitle = 'Report a Scammer';
                if (selectedValue === 'report_rule') categoryTitle = 'Report Server Rule Violation';
                if (selectedValue === 'report_dm') categoryTitle = 'Report DM Advertising';

                const modal = new ModalBuilder()
                    .setCustomId(`report_modal_${selectedValue}`)
                    .setTitle(categoryTitle);

                const suspectInput = new TextInputBuilder()
                    .setCustomId('suspect_input')
                    .setLabel('Suspect Username / ID / Profile Link')
                    .setPlaceholder('e.g., username#0000 or User ID')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const evidenceInput = new TextInputBuilder()
                    .setCustomId('evidence_input')
                    .setLabel('Evidence (Image/Video link or Message link)')
                    .setPlaceholder('Paste screenshot link or message link here')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const descriptionInput = new TextInputBuilder()
                    .setCustomId('description_input')
                    .setLabel('Explain what happened')
                    .setPlaceholder('Provide a brief summary of the violation...')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(suspectInput),
                    new ActionRowBuilder().addComponents(evidenceInput),
                    new ActionRowBuilder().addComponents(descriptionInput)
                );

                await interaction.showModal(modal);
            } 
            else if (interaction.isModalSubmit() && interaction.customId.startsWith('report_modal_')) {
                const suspect = interaction.fields.getTextInputValue('suspect_input');
                const evidence = interaction.fields.getTextInputValue('evidence_input');
                const details = interaction.fields.getTextInputValue('description_input');
                const reportType = interaction.customId.replace('report_modal_', '');

            let categoryName = 'General Report';
                if (reportType === 'report_scammer') categoryName = '🚨 Scammer Report';
                if (reportType === 'report_rule') categoryName = '⚠️ Rule Violation';
                if (reportType === 'report_dm') categoryName = '📢 DM Advertising';

                const logChannel = interaction.guild.channels.cache.get(TARGET_CHANNEL_ID);
                
                const reportEmbed = new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setTitle(`New Report: ${categoryName}`)
                    .addFields(
                        { name: '👤 Reporter', value: `${interaction.user} (${interaction.user.tag})`, inline: false },
                        { name: '🎯 Accused / Suspect', value: suspect, inline: false },
                        { name: '🔗 Evidence', value: evidence, inline: false },
                        { name: '📝 Description', value: details, inline: false }
                    )
                    .setTimestamp();

                if (logChannel) {
                    await logChannel.send({ embeds: [reportEmbed] }).catch(() => {});
                }

                const userDmEmbed = new EmbedBuilder()
                    .setColor(0x00FF00)
                    .setTitle('✅ Report Submitted Successfully')
                    .setDescription(`Your report regarding **${suspect}** in **${interaction.guild.name}** has been securely submitted to our moderation team.\n\n*Thank you for helping us keep the community safe.*`)
                    .setTimestamp();

                await interaction.user.send({ embeds: [userDmEmbed] }).catch(() => {});

                await interaction.reply({
                    content: '✅ **Your report has been successfully submitted to the moderation team, and a confirmation DM has been sent to you!**',
                    ephemeral: true
                });
            }
        } catch (error) {
            console.error('[Report Interaction Error]:', error);
        }
    }
};
