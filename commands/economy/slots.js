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

// Slot symbols and their multipliers
const symbols = ['🍒', '🍋', '🍊', '🍇', '🔔', '💎', ' 7️⃣ '];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('slots')
        .setDescription('Play the slot machine and test your luck for a massive jackpot!')
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('The amount of money you want to bet')
                .setRequired(true)
                .setMinValue(1)),

    async execute(interaction) {
        await interaction.deferReply();

        const userId = interaction.user.id;
        const betAmount = interaction.options.getInteger('amount');

        const economyData = loadEconomyData();
        if (!economyData[userId]) {
            economyData[userId] = { wallet: 0, bank: 0, inventory: {} };
        }

        const userProfile = economyData[userId];
        const userWallet = userProfile.wallet || 0;

        if (userWallet < betAmount) {
            return await interaction.editReply({
                content: `❌ You don't have enough cash in your wallet! Your current wallet balance is \`$${userWallet.toLocaleString()}\`.`
            });
        }

        const inventory = userProfile.inventory || {};
        
        // Check for luxury casino items to give a slight luck boost
        let jackpotChanceBonus = 0;
        let luckyItemUsed = null;

        if ((inventory['casino_chip_legendary'] || 0) > 0) {
            jackpotChanceBonus = 0.08; // +8% better outcomes
            luckyItemUsed = 'Legendary Casino Chip';
        } else if ((inventory['golden_ticket'] || 0) > 0) {
            jackpotChanceBonus = 0.04; // +4% better outcomes
            luckyItemUsed = 'Golden Ticket';
        }

        // Spin the 3 reels
        let slot1 = symbols[Math.floor(Math.random() * symbols.length)];
        let slot2 = symbols[Math.floor(Math.random() * symbols.length)];
        let slot3 = symbols[Math.floor(Math.random() * symbols.length)];

        // If they have a lucky item and lost on a normal roll, give them a chance to reroll one symbol for a win
        if (jackpotChanceBonus > 0 && slot1 !== slot2 && slot2 !== slot3) {
            if (Math.random() < jackpotChanceBonus) {
                slot2 = slot1; // Match second reel to first reel
            }
        }

        let payout = 0;
        let resultMessage = '';

        if (slot1 === slot2 && slot2 === slot3) {
            // Jackpot (All 3 match)
            if (slot1 === ' 7️⃣ ' || slot1 === '💎') {
                payout = betAmount * 10; // Mega jackpot
                resultMessage = `🎰 **JACKPOT!** All three matched! You won **10x** your bet!`;
            } else {
                payout = betAmount * 5; // Standard triple match
                resultMessage = `🎉 **Big Win!** Three matching symbols! You won **5x** your bet!`;
            }
            userProfile.wallet += (payout - betAmount); // Net profit added
        } else if (slot1 === slot2 || slot2 === slot3 || slot1 === slot3) {
            // Small win (2 match)
            payout = Math.floor(betAmount * 1.5);
            resultMessage = `✨ **Small Win!** Two matching symbols! You won **1.5x** your bet!`;
            userProfile.wallet += (payout - betAmount);
        } else {
            // Loss
            payout = 0;
            resultMessage = `😢 **Loss!** No matching symbols. Better luck next time!`;
            userProfile.wallet -= betAmount;
        }

        saveEconomyData(economyData);

        const embed = new EmbedBuilder()
            .setColor(payout > 0 ? 0x00FF00 : 0xFF0000)
            .setTitle('🎰 Casino Slot Machine')
            .setDescription(`[ ${slot1} \vert{}${slot2} | ${slot3} ]\n\n${resultMessage}`)
            .addFields(
                { name: 'Bet Amount', value: `\`$${betAmount.toLocaleString()}\``, inline: true },
                { name: 'Payout', value: `\`$${payout.toLocaleString()}\``, inline: true },
                { name: 'New Wallet Balance', value: `\`$${userProfile.wallet.toLocaleString()}\``, inline: false }
            )
            .setTimestamp();

        if (luckyItemUsed) {
            embed.setFooter({ text: `✨ Perk active: Your ${luckyItemUsed} helped tweak the reels!` });
        }

        await interaction.editReply({ embeds: [embed] });
    },
};
