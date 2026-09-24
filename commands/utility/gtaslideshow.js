const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

const vehicles = [
    { name: 'Pegassi Zentorno', image: 'https://static.wikia.nocookie.net/gtawiki/images/images/images/Zentorno-GTAV.png' },
    { name: 'Progen T20', image: 'https://static.wikia.nocookie.net/gtawiki/images/images/images/T20-GTAV.png' },
    { name: 'Grotti Itali GTO', image: 'https://static.wikia.nocookie.net/gtawiki/images/images/images/ItaliGTO-GTAV.png' },
    { name: 'Ocelot Pariah', image: 'https://static.wikia.nocookie.net/gtawiki/images/images/images/Pariah-GTAV.png' }
];

module.exports = {
    name: 'gta-slideshow',
    description: 'Updates vehicle image in the same message every 5 seconds',
    default_member_permissions: PermissionFlagsBits.Administrator,
    async execute(interaction) {
        await interaction.reply({ content: '🚗 Starting live car slideshow in this channel...', ephemeral: true });

        let index = 0;

        // Pehla embed message bhejein
        const embed = new EmbedBuilder()
            .setColor('#ffaa00')
            .setTitle('🏎️ GTA V Car Showcase')
            .setDescription(`Vehicle: **${vehicles[index].name}**`)
            .setImage(vehicles[index].image);

        const msg = await interaction.channel.send({ embeds: [embed] });

        // Har 5 seconds baad USI message ko edit karke nayi car dikhayein
        const interval = setInterval(async () => {
            index = (index + 1) % vehicles.length;

            const updatedEmbed = new EmbedBuilder()
                .setColor('#ffaa00')
                .setTitle('🏎️ GTA V Car Showcase')
                .setDescription(`Vehicle: **${vehicles[index].name}**`)
                .setImage(vehicles[index].image);

            try {
                await msg.edit({ embeds: [updatedEmbed] });
            } catch (err) {
                clearInterval(interval);
            }
        }, 5000);
    },
};
