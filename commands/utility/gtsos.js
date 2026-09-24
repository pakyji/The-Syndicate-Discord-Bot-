const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('gtsos')
        .setDescription('Sends the GTA SOS & LFG interactive menu button'),

    async execute(interaction) {
        // Sirf authorized users ke liye ya admin ke liye rakh sakte hain (optional)
        const targetChannelId = '902047746624749588';
        const targetChannel = interaction.guild.channels.cache.get(targetChannelId) || await interaction.guild.channels.fetch(targetChannelId).catch(() => null);

        if (!targetChannel) {
            return interaction.reply({ content: '❌ Target button channel nahi mila!', ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setColor('#FF4500')
            .setTitle('🚨 GTA Online SOS & LFG Center')
            .setDescription('Need help with heists, setups, or finding a crew? Click the button below to open the complete GTA menu and find players instantly!')
            .setFooter({ text: 'GTA V Community Support' })
            .setTimestamp();

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('gta_sos_start')
                    .setLabel('🎮 Open GTA SOS Menu')
                    .setStyle(ButtonStyle.Danger)
            );

        await targetChannel.send({ embeds: [embed], components: [row] });
        await interaction.reply({ content: `✅ GTA SOS button successfully sent to <#${targetChannelId}>!`, ephemeral: true });
    },
};
