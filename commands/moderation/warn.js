const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Path to the warnings JSON data file
const warningsFilePath = path.join(__dirname, '../warnings.json');

// Function to load warnings data from the file
function getWarningsData() {
    if (!fs.existsSync(warningsFilePath)) return {};
    try {
        return JSON.parse(fs.readFileSync(warningsFilePath, 'utf8'));
    } catch (e) {
        return {};
    }
}

// Function to save warnings data to the file
function saveWarningsData(data) {
    fs.writeFileSync(warningsFilePath, JSON.stringify(data, null, 2));
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Issue a warning to a member')
        .addUserOption(option => 
            option.setName('target')
                .setDescription('The member to warn')
                .setRequired(true))
        .addStringOption(option => 
            option.setName('reason')
                .setDescription('Reason for the warning')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    async execute(interaction) {
        const target = interaction.options.getUser('target');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        const guildId = interaction.guild.id;

        // Load existing warnings data
        let warningsData = getWarningsData();
        if (!warningsData[guildId]) warningsData[guildId] = {};
        if (!warningsData[guildId][target.id]) warningsData[guildId][target.id] = 0;

        // Increment the warning count
        warningsData[guildId][target.id] += 1;
        const currentWarnings = warningsData[guildId][target.id];
        saveWarningsData(warningsData);

        // Send confirmation embed for the warning
        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('⚠️ Member Warned')
            .setDescription(`**${target.tag}** has been warned.\n\n👤 **User:** ${target}\n🔢 **Total Warnings:** ${currentWarnings} / 3\n📝 **Reason:** ${reason}`)
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });

        // Check if the warning count has reached or exceeded 3
        if (currentWarnings >= 3) {
            const MODERATOR_ROLE_ID = '901459542976630865'; // Your updated Moderator Role ID

            const alertEmbed = new EmbedBuilder()
                .setColor('#FFA500')
                .setTitle('🚨 Warning Limit Reached!')
                .setDescription(`⚠️ **${target}** (${target.tag}) has received **3 warnings**!\nPlease take necessary action (Kick/Ban/Mute).`)
                .setTimestamp();

            await interaction.channel.send({
                content: `<@&${MODERATOR_ROLE_ID}>`, // Pings the moderator role using the provided ID
                embeds: [alertEmbed]
            });
        }
    },
};
