const { ChannelType, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const VERIFIED_ROLE_NAME = 'Verified';

async function updateOrCreateServerStats(guild) {
    let statsChannel = guild.channels.cache.find(c => c.name.startsWith('📊 Members:'));
    
    if (!statsChannel) {
        try {
            statsChannel = await guild.channels.create({
                name: `📊 Members: ${guild.memberCount}`,
                type: ChannelType.GuildVoice,
                position: 0, // Server ke bilkul top par rakhne ke liye
                permissionOverwrites: [
                    {
                        id: guild.id,
                        deny: [PermissionFlagsBits.Connect], // Koi voice channel mein join na kar sake
                    },
                ],
            });
        } catch (error) {
            console.error('Failed to create stats channel:', error);
        }
    } else {
        await statsChannel.setName(`📊 Members: ${guild.memberCount}`).catch(() => {});
        await statsChannel.setPosition(0).catch(() => {});
    }
}

module.exports = {
    name: 'guildMemberAdd',
    async execute(member, client) {
        try {
            // 1. Update or Create Server Stats at the Top
            await updateOrCreateServerStats(member.guild);

            // 2. Send Public Welcome Message (Channel ID: 901709300383227934)
            const welcomeChannelId = '901709300383227934';
            const welcomeChannel = member.guild.channels.cache.get(welcomeChannelId);
            
            if (welcomeChannel) {
                const welcomeEmbed = new EmbedBuilder()
                    .setColor(0x00FF00)
                    .setTitle('👋 New Member Joined!')
                    .setDescription(`Welcome to **${member.guild.name}**, ${member}! We are glad to have you here.`)
                    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                    .addFields({ name: 'Total Members', value: `${member.guild.memberCount}`, inline: true })
                    .setTimestamp();

                await welcomeChannel.send({ embeds: [welcomeEmbed] }).catch(() => {});
            }

            // 3. Create Verification Role & Private Ticket Channel
            let role = member.guild.roles.cache.find(r => r.name === VERIFIED_ROLE_NAME);
            if (!role) {
                role = await member.guild.roles.create({
                    name: VERIFIED_ROLE_NAME,
                    color: '#00FF00',
                    reason: 'Auto-created by The Syndicate bot for member verification',
                }).catch(() => {});
            }

            const verificationChannel = await member.guild.channels.create({
                name: `verify-${member.user.username}`,
                type: ChannelType.GuildText,
                permissionOverwrites: [
                    { id: member.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                    { id: member.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
                    { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] }
                ]
            });

            const embed = new EmbedBuilder()
                .setColor('#2b2d31')
                .setTitle('The Syndicate Verification')
                .setDescription('Welcome! Click your gaming platform below to unlock the server.');

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('verify_ps4').setLabel('PS4').setStyle(ButtonStyle.Primary).setEmoji('🎮'),
                new ButtonBuilder().setCustomId('verify_ps5').setLabel('PS5').setStyle(ButtonStyle.Primary).setEmoji('🎮'),
                new ButtonBuilder().setCustomId('verify_pc').setLabel('PC').setStyle(ButtonStyle.Success).setEmoji('💻'),
                new ButtonBuilder().setCustomId('verify_nongamer').setLabel('Non-Gamer').setStyle(ButtonStyle.Secondary).setEmoji('👤')
            );

            await verificationChannel.send({ content: `Hey <@${member.id}>! Welcome to the server.`, embeds: [embed], components: [row] });
        } catch (error) {
            console.error('GuildMemberAdd error:', error);
        }
    },
};
