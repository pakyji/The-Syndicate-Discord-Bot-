const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');

// Initialize an independent client for deploying the panel
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages
    ]
});

// Your target channel where the panel should be sent permanently
const TARGET_CHANNEL_ID = '1553912075494105139';

client.once('ready', async () => {
    console.log(`[Panel Deployer] Logged in as ${client.user.tag}`);

    try {
        const channel = await client.channels.fetch(TARGET_CHANNEL_ID);
        if (!channel) {
            console.error('[Panel Deployer Error]: Target channel not found!');
            process.exit(1);
        }

        // Create the interactive dropdown menu
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

        // Create the rich embed matching your design
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

        // Send the permanent message to the channel
        await channel.send({ embeds: [embed], components: [row] });
        console.log('[Panel Deployer]: Successfully deployed the permanent report panel to the channel!');
        
        // Exit after sending
        setTimeout(() => process.exit(0), 2000);

    } catch (error) {
        console.error('[Panel Deployer Error]:', error);
        process.exit(1);
    }
});

// Automatically reads the token from your panel environment variables
client.login(process.env.DISCORD_TOKEN);
