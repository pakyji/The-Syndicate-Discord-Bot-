const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('poll')
        .setDescription('Create a simple Yes/No poll')
        .addStringOption(option =>
            option.setName('question')
                .setDescription('What is the poll about?')
                .setRequired(true)
        ),

    async execute(interaction) {
        const question = interaction.options.getString('question');

        const pollEmbed = new EmbedBuilder()
            .setColor('#00AAFF')
            .setTitle('📊 Community Poll')
            .setDescription(`**${question}**`)
            .setFooter({ text: `Requested by ${interaction.user.username}` })
            .setTimestamp();

        await interaction.reply({ content: '✅ Poll created!', ephemeral: true });

        const pollMessage = await interaction.channel.send({ embeds: [pollEmbed] });

        // Simple thumbs up / thumbs down reactions
        await pollMessage.react('👍');
        await pollMessage.react('👎');
    },
};
