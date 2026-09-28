const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

const TARGET_CHANNEL_ID = '1553912075494105139';

client.once('ready', async () => {
    try {
        const channel = await client.channels.fetch(TARGET_CHANNEL_ID);
        if (!channel) process.exit(1);

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('report_category_select')
            .setPlaceholder('📌 Select a Report Category...')
            .addOptions([
                { label: 'Report a Scammer', description: 'Report someone for scamming or attempted scamming.', value: 'report_scammer', emoji: '🚨' },
                { label: 'Server Rule Violation', description: 'Report harassment, slurs, NSFW, or general rule-breaking.', value: 'report_rule', emoji: '⚠️' },
                { label: 'DM Advertising', description: 'Report unsolicited self-promotion or advertising in DMs.', value: 'report_dm', emoji: '📢' }
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

        await channel.send({ embeds: [embed], components: [row] });
        setTimeout(() => process.exit(0), 2000);
    } catch (error) {
        process.exit(1);
    }
});

client.login(process.env.DISCORD_TOKEN);
