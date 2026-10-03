const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const storagePath = path.join(__dirname, 'economyStorage.json');

function loadEconomyData() {
    if (!fs.existsSync(storagePath)) {
        fs.writeFileSync(storagePath, JSON.stringify({}, null, 4));
    }
    return JSON.parse(fs.readFileSync(storagePath, 'utf8'));
}

function saveEconomyData(data) {
    fs.writeFileSync(storagePath, JSON.stringify(data, null, 4));
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('coinflip')
        .setDescription('Flip a coin to double your money or lose it!')
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('The amount of money you want to bet')
                .setRequired(true)
                .setMinValue(1))
        .addStringOption(option =>
            option.setName('choice')
                .setDescription('Choose heads or tails')
                .setRequired(true)
                .addChoices(
                    { name: 'Heads', value: 'heads' },
                    { name: 'Tails', value: 'tails' }
                )),

    async execute(interaction) {
        await interaction.deferReply();

        const userId = interaction.user.id;
        const betAmount = interaction.options.getInteger('amount');
        const userChoice = interaction.options.getString('choice');

        const economyData = loadEconomyData();
        if (!economyData[userId]) {
            economyData[userId] = { wallet: 0, bank: 0, inventory: {} };
        }

        const userProfile = economyData[userId];
        const userWallet = userProfile.wallet || 0;

        // Check if user has enough money in wallet
        if (userWallet < betAmount) {
            return await interaction.editReply({
                content: `❌ You don't have enough cash in your wallet! Your current wallet balance is \`$${userWallet.toLocaleString()}\`.`
            });
        }

        const inventory = userProfile.inventory || {};
        
        // Luck bonus check: if they have a Lucky Coin or Card Shark Deck, boost win chance slightly
        let winChance = 0.50; // Standard 50%
        let luckyItemUsed = null;

        if ((inventory['lucky_coin'] || 0) > 0) {
            winChance = 0.55; // 55% chance with Lucky Coin
            luckyItemUsed = 'Lucky Coin';
        } else if ((inventory['card_shark_deck'] || 0) > 0) {
            winChance = 0.53; // 53% chance with Card Shark Deck
            luckyItemUsed = 'Card Shark Deck';
        }

        // Determine coinflip result (Heads or Tails)
        const result = Math.random() < winChance ? userChoice : (userChoice === 'heads' ? 'tails' : 'heads');
        const won = (result === userChoice);

        if (won) {
            userProfile.wallet += betAmount;
        } else {
            userProfile.wallet -= betAmount;
        }

        saveEconomyData(economyData);

        const embed = new EmbedBuilder()
            .setColor(won ? 0x00FF00 : 0xFF0000)
            .setTitle(won ? '🎉 Coinflip: You Won!' : '😢 Coinflip: You Lost!')
            .setDescription(`The coin landed on **${result.toUpperCase()}**!`)
            .addFields(
                { name: 'Your Bet', value: `\`$${betAmount.toLocaleString()}\``, inline: true },
                { name: 'Your Choice', value: `\`${userChoice.toUpperCase()}\``, inline: true },
                { name: 'Outcome', value: won ? `\`+$${betAmount.toLocaleString()}\`` : `\`-$${betAmount.toLocaleString()}\``, inline: true },
                { name: 'New Wallet Balance', value: `\`$${userProfile.wallet.toLocaleString()}\``, inline: false }
            )
            .setTimestamp();

        if (luckyItemUsed) {
            embed.setFooter({ text: `✨ Perk active: Your ${luckyItemUsed} gave you a slight edge!` });
        }

        await interaction.editReply({ embeds: [embed] });
    },
};
