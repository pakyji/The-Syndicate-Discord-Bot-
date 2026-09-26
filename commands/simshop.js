const { SlashCommandBuilder, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const fs = require('fs');
const path = './coins.json';

function getCoinsData() {
    if (!fs.existsSync(path)) return {};
    return JSON.parse(fs.readFileSync(path, 'utf8'));
}

function saveCoinsData(data) {
    fs.writeFileSync(path, JSON.stringify(data, null, 2));
}

// SIM Card & Network Provider Inventory
const simItems = {
    "tim_sim": { name: "📶 TIM Prepaid SIM", price: 100, type: "item", desc: "Classic national coverage SIM card with bonus data coins." },
    "vodafone_sim": { name: "🔴 Vodafone 5G SIM", price: 150, type: "item", desc: "Ultra-fast 5G connection with a high-speed coin reward." },
    "windtre_sim": { name: "🟠 WindTre Unlimited SIM", price: 200, type: "item", desc: "Unlimited talk & text SIM with a special cashback bonus." },
    "iliad_sim": { name: "🟣 Iliad Flash SIM", price: 250, type: "item", desc: "Best value low-cost SIM card with a massive coin jackpot." },

    "network_guru": { name: "📡 Network Guru Role", price: 600, type: "role", roleName: "Network Guru", desc: "Exclusive role for telecom experts." },
    "cyber_operator": { name: "🛰️ Cyber Telecom Operator", price: 1200, type: "role", roleName: "Cyber Operator", desc: "Elite telecom infrastructure controller role." }
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('simshop')
        .setDescription('Visit the SIM Card & Mobile Network Provider Shop')
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('Browse mobile operator SIM cards and network roles'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('buy')
                .setDescription('Activate a SIM card or buy a network role')
                .addStringOption(option =>
                    option.setName('item')
                        .setDescription('Select the SIM or role to purchase')
                        .setRequired(true)
                        .addChoices(
                            { name: '📶 TIM Prepaid SIM - 100 Coins', value: 'tim_sim' },
                            { name: '🔴 Vodafone 5G SIM - 150 Coins', value: 'vodafone_sim' },
                            { name: '🟠 WindTre Unlimited SIM - 200 Coins', value: 'windtre_sim' },
                            { name: '🟣 Iliad Flash SIM - 250 Coins', value: 'iliad_sim' },
                            { name: '📡 Network Guru Role - 600 Coins', value: 'network_guru' },
                            { name: '🛰️ Cyber Telecom Operator - 1200 Coins', value: 'cyber_operator' }
                        ))),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const userId = interaction.user.id;
        const coinsData = getCoinsData();
        const userCoins = coinsData[userId] || 0;

        if (subcommand === 'view') {
            const embed = new EmbedBuilder()
                .setColor('#e74c3c')
                .setTitle('📶 Telecom & SIM Card Center')
                .setDescription('Choose your network operator! Use `/simshop buy [item]` to activate SIM cards or acquire network roles.')
                .addFields(
                    { 
                        name: '📡 Mobile Operator SIM Cards (Requires Registration Form)', 
                        value: '• **TIM Prepaid SIM** (`tim_sim`) - 100 Coins\n• **Vodafone 5G SIM** (`vodafone_sim`) - 150 Coins\n• **WindTre Unlimited SIM** (`windtre_sim`) - 200 Coins\n• **Iliad Flash SIM** (`iliad_sim`) - 250 Coins', 
                        inline: false 
                    },
                    { 
                        name: '⭐ Telecom & Network Roles', 
                        value: '• **Network Guru Role** (`network_guru`) - 600 Coins\n• **Cyber Telecom Operator** (`cyber_operator`) - 1200 Coins', 
                        inline: false 
                    }
                )
                .setTimestamp()
                .setFooter({ text: `Your Balance: ${userCoins} Coins 🪙` });

            return await interaction.reply({ embeds: [embed] });
        } 
        
        else if (subcommand === 'buy') {
            const itemKey = interaction.options.getString('item');
            const item = simItems[itemKey];

            if (!item) {
                return await interaction.reply({ content: '❌ Invalid SIM or item selected!', ephemeral: true });
            }

            if (userCoins < item.price) {
                return await interaction.reply({ 
                    content: `❌ You do not have enough coins! You need **${item.price}** coins, but you only have **${userCoins}** coins.`, 
                    ephemeral: true 
                });
            }

            // If the user is buying a role, process it immediately
            if (item.type === 'role') {
                const role = interaction.guild.roles.cache.find(r => r.name === item.roleName);
                if (!role) {
                    return await interaction.reply({ 
                        content: `⚠️ Error: The role **"${item.roleName}"** does not exist in this server. Please ask an admin to create it first!`, 
                        ephemeral: true 
                    });
                }

                try {
                    coinsData[userId] -= item.price;
                    saveCoinsData(coinsData);
                    await interaction.member.roles.add(role);
                    return await interaction.reply({ 
                        content: `🎉 Success! You purchased **${item.name}** and the network role has been assigned to you! 📡✨`, 
                        ephemeral: true 
                    });
                } catch (error) {
                    console.error(error);
                    return await interaction.reply({ content: '❌ Failed to assign the role. Please check bot permissions and role hierarchy.', ephemeral: true });
                }
            } 
            
            // If the user is buying a SIM card, open a Registration Form (Modal)
            else if (item.type === 'item') {
                const modal = new ModalBuilder()
                    .setCustomId(`sim_register_${itemKey}`)
                    .setTitle(`SIM Registration: ${item.name}`);

                const phoneInput = new TextInputBuilder()
                    .setCustomId('phone_number_input')
                    .setLabel('Desired Phone Number / Serial')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('e.g., +39 333 1234567')
                    .setRequired(true);

                const planInput = new TextInputBuilder()
                    .setCustomId('plan_name_input')
                    .setLabel('Preferred Tariff Plan / Notes')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('e.g., Unlimited Data 5G Plan')
                    .setRequired(true);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(phoneInput),
                    new ActionRowBuilder().addComponents(planInput)
                );

                // Show the modal to the user
                await interaction.showModal(modal);

                // Wait for the user to submit the form
                try {
                    const filter = (i) => i.customId === `sim_register_${itemKey}` && i.user.id === interaction.user.id;
                    const modalInteraction = await interaction.awaitModalSubmit({ filter, time: 60 * 1000 });

                    const phoneNumber = modalInteraction.fields.getTextInputValue('phone_number_input');
                    const planNotes = modalInteraction.fields.getTextInputValue('plan_name_input');

                    // Deduct coins after successful form submission
                    const latestData = getCoinsData();
                    latestData[userId] -= item.price;

                    let simBonusMsg = '';
                    if (itemKey === 'tim_sim') {
                        const bonus = Math.floor(Math.random() * 50) + 30;
                        latestData[userId] += bonus;
                        simBonusMsg = ` 📶 TIM activation bonus! You received **${bonus} coins** worth of free data!`;
                    } else if (itemKey === 'vodafone_sim') {
                        const bonus = Math.floor(Math.random() * 90) + 40;
                        latestData[userId] += bonus;
                        simBonusMsg = ` 🔴 Vodafone 5G bonus! You unlocked **${bonus} coins** network cashback!`;
                    } else if (itemKey === 'windtre_sim') {
                        const bonus = Math.floor(Math.random() * 130) + 60;
                        latestData[userId] += bonus;
                        simBonusMsg = ` 🟠 WindTre top-up reward! You gained **${bonus} coins** back!`;
                    } else if (itemKey === 'iliad_sim') {
                        const bonus = Math.floor(Math.random() * 200) + 100;
                        latestData[userId] += bonus;
                        simBonusMsg = ` 🟣 Iliad flash deal jackpot! You won **${bonus} coins** back!`;
                    }

                    saveCoinsData(latestData);

                    const successEmbed = new EmbedBuilder()
                        .setColor('#2ecc71')
                        .setTitle('✅ SIM Card Registered Successfully!')
                        .setDescription(`Your **${item.name}** has been officially registered and activated!`)
                        .addFields(
                            { name: '📱 Phone Number', value: phoneNumber, inline: true },
                            { name: '📋 Tariff Plan', value: planNotes, inline: true },
                            { name: '💰 Status', value: `Activated successfully!${simBonusMsg}`, inline: false }
                        )
                        .setTimestamp();

                    await modalInteraction.reply({ embeds: [successEmbed], ephemeral: true });

                } catch (err) {
                    console.error('Modal error or timeout:', err);
                    // If user took too long or cancelled, coins are not deducted
                }
            }
        }
    },
};                    
