const { Client, GatewayIntentBits, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages
    ]
});

const TARGET_CHANNEL_ID = '1553912075494105139';

client.once('ready', () => {
    console.log(`[Report Listener] Online as ${client.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
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

            const logChannel = await client.channels.fetch(TARGET_CHANNEL_ID).catch(() => null);
            
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
    } catch (err) {
        console.error('[Report Listener Error]:', err);
    }
});

client.login(process.env.DISCORD_TOKEN);
