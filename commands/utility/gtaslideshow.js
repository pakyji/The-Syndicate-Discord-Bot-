const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

const vehicles = [
    { name: 'Pegassi Zentorno', price: '$725,000', image: 'https://static.wikia.nocookie.net/gtawiki/images/images/images/Zentorno-GTAV.png' },
    { name: 'Progen T20', price: '$2,200,000', image: 'https://static.wikia.nocookie.net/gtawiki/images/images/images/T20-GTAV.png' },
    { name: 'Grotti Itali GTO', price: '$1,965,000', image: 'https://static.wikia.nocookie.net/gtawiki/images/images/images/ItaliGTO-GTAV.png' },
    { name: 'Ocelot Pariah', price: '$1,420,000', image: 'https://static.wikia.nocookie.net/gtawiki/images/images/images/Pariah-GTAV.png' },
    { name: 'Pegassi Ignus', price: '$2,765,000', image: 'https://static.wikia.nocookie.net/gtawiki/images/images/images/Ignus-GTAV.png' },
    { name: 'Pfister Neon', price: '$1,500,000', image: 'https://static.wikia.nocookie.net/gtawiki/images/images/images/Neon-GTAV.png' },
    { name: 'Benefactor Krieger', price: '$2,875,000', image: 'https://static.wikia.nocookie.net/gtawiki/images/images/images/Krieger-GTAV.png' },
    { name: 'Annis RE-7B', price: '$2,475,000', image: 'https://static.wikia.nocookie.net/gtawiki/images/images/images/RE7B-GTAV.png' },
    { name: 'Grotti X80 Proto', price: '$2,700,000', image: 'https://static.wikia.nocookie.net/gtawiki/images/images/images/X80Proto-GTAV.png' },
    { name: 'Pegassi Osiris', price: '$1,950,000', image: 'https://static.wikia.nocookie.net/gtawiki/images/images/images/Osiris-GTAV.png' }
];

module.exports = {
    name: 'gta-slideshow',
    description: 'Slideshow of GTA vehicles with price updating every 5 seconds',
    default_member_permissions: PermissionFlagsBits.Administrator,
    async execute(interaction) {
        await interaction.reply({ content: '🚗 Starting GTA vehicle showcase slideshow...', ephemeral: true });

        let index = 0;

        const getEmbed = (i) => {
            return new EmbedBuilder()
                .setColor('#ffaa00')
                .setTitle('🏎️ GTA V Vehicle Showcase')
                .setDescription(`💰 **Price:** ${vehicles[i].price}\n🚗 **Vehicle:** ${vehicles[i].name}`)
                .setImage(vehicles[i].image)
                .setFooter({ text: `Vehicle ${i + 1} of ${vehicles.length}` });
        };

        const msg = await interaction.channel.send({ embeds: [getEmbed(index)] });

        const interval = setInterval(async () => {
            index = (index + 1) % vehicles.length;

            try {
                await msg.edit({ embeds: [getEmbed(index)] });
            } catch (err) {
                clearInterval(interval);
            }
        }, 5000);
    },
};
