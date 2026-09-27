const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '../twitchConfig.json');

function getTwitchConfig() {
    if (!fs.existsSync(configPath)) {
        fs.writeFileSync(configPath, JSON.stringify({}));
    }
    try {
        return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (err) {
        return {};
    }
}

function saveTwitchConfig(data) {
    fs.writeFileSync(configPath, JSON.stringify(data, null, 2));
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('twitch')
        .setDescription('Manage Twitch live stream notifications')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addSubcommand(subcommand =>
            subcommand
                .setName('set')
                .setDescription('Set the Discord channel for Twitch notifications')
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('The text channel for notifications')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Add a Twitch streamer to track')
                .addStringOption(option =>
                    option.setName('username')
                        .setDescription('Twitch username of the streamer')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove a tracked Twitch streamer')
                .addStringOption(option =>
                    option.setName('username')
                        .setDescription('Twitch username to remove')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('test')
                .setDescription('Send a test live notification to the configured channel')
                .addStringOption(option =>
                    option.setName('username')
                        .setDescription('Streamer username for testing')
                        .setRequired(false))),

    category: 'Utility',

    async execute(interaction) {
        try {
            const guildId = interaction.guild.id;
            const subcommand = interaction.options.getSubcommand();
            const config = getTwitchConfig();

            if (!config[guildId]) {
                config[guildId] = {
                    notificationChannelId: '1535656663510417469', // Default channel ID you provided
                    streamers: []
                };
            }

            if (subcommand === 'set') {
                const targetChannel = interaction.options.getChannel('channel');
                if (targetChannel.type !== 0) { // 0 = GuildText
                    return interaction.reply({ content: '❌ Please select a valid Text Channel!', ephemeral: true });
                }

                config[guildId].notificationChannelId = targetChannel.id;
                saveTwitchConfig(config);

                const embed = new EmbedBuilder()
                    .setColor(0x9146FF)
                    .setTitle('📺 Twitch Notification Channel Set')
                    .setDescription(`Successfully set <#${targetChannel.id}> (\`${targetChannel.id}\`) as the official Twitch alert channel!`)
                    .setTimestamp();

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            if (subcommand === 'add') {
                const username = interaction.options.getString('username').toLowerCase().trim();
                if (!config[guildId].streamers) config[guildId].streamers = [];

                if (config[guildId].streamers.includes(username)) {
                    return interaction.reply({ content: `❌ Streamer **${username}`} is already in the tracking list!`, ephemeral: true });
                }

                config[guildId].streamers.push(username);
                saveTwitchConfig(config);

                const embed = new EmbedBuilder()
                    .setColor(0x00FF66)
                    .setTitle('➕ Twitch Streamer Added')
                    .setDescription(`Successfully added **${username}** to the tracking list!`)
                    .setTimestamp();

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            if (subcommand === 'remove') {
                const username = interaction.options.getString('username').toLowerCase().trim();
                if (!config[guildId].streamers || !config[guildId].streamers.includes(username)) {
                    return interaction.reply({ content: `❌ Streamer **${username}** is not in the tracking list!`, ephemeral: true });
                }

                config[guildId].streamers = config[guildId].streamers.filter(s => s !== username);
                saveTwitchConfig(config);

                const embed = new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setTitle('➖ Twitch Streamer Removed')
                    .setDescription(`Successfully removed **${username}** from the tracking list.`)
                    .setTimestamp();

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            if (subcommand === 'test') {
                const streamer = interaction.options.getString('username') || 'SyndicateGaming';
                const channelId = config[guildId].notificationChannelId || '1535656663510417469';

                const targetChannel = await interaction.guild.channels.fetch(channelId).catch(() => null);
                if (!targetChannel) {
                    return interaction.reply({ content: `❌ Configured notification channel (<#${channelId}>) not found or bot lacks permission!`, ephemeral: true });
                }

                const liveEmbed = new EmbedBuilder()
                    .setColor(0x9146FF)
                    .setTitle(`🔴 ${streamer.toUpperCase()} IS NOW LIVE ON TWITCH!`)
                    .setURL(`https://twitch.tv/${streamer}`)
                    .setDescription(`**${streamer}** has started streaming on Twitch!\n\n` +
                        `🎮 **Category:** Syndicate Gaming\n` +
                        `📢 **Title:** Ultimate Syndicate Live Stream | !socials !discord\n\n` +
                        `*Click the button below to join the stream!*`)
                    .setImage(`https://static-cdn.jtvnw.net/previews-ttv/live_user_${streamer}-1920x1080.jpg`)
                    .setFooter({ text: 'Syndicate Twitch Alert System' })
                    .setTimestamp();

                await targetChannel.send({ 
                    content: `Hey @everyone! **${streamer}** is live right now! 🚀`, 
                    embeds: [liveEmbed] 
                });

                return interaction.reply({ content: `✅ Test notification successfully sent to <#${channelId}>!`, ephemeral: true });
            }

        } catch (error) {
            console.error('Error in twitch command:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: '❌ An error occurred while processing the twitch command.', ephemeral: true });
            }
        }
    },
};
