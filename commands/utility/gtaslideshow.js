const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

const vehicles = [
    { name: 'Pegassi Zentorno', price: '$725,000', image: 'https://images.unsplash.com/photo-1542282088-72c9c27ed0cd?w=800' },
    { name: 'Progen T20', price: '$2,200,000', image: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800' },
    { name: 'Grotti Itali GTO', price: '$1,965,000', image: 'https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800' },
    { name: 'Ocelot Pariah', price: '$1,420,000', image: 'https://images.unsplash.com/photo-1617814076367-b759c7d7e738?w=800' },
    { name: 'Benefactor Krieger', price: '$2,875,000', image: 'https://images.unsplash.com/photo-1525609004556-c46c7d6cf023?w=800' }
];

module.exports = {
    name: 'gta-slideshow',
    description: 'Shows vehicle price and image, updating in the same message every 5 seconds',
    default_member_permissions: PermissionFlagsBits.Administrator,
    async execute(interaction) {
        await interaction.reply({ content: '🚗 Starting GTA vehicle & price slideshow with images...', ephemeral: true });

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
