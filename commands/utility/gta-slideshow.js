/**
 * /gta-slideshow — rotating GTA vehicle showcase.
 *
 * Fixes vs. the original:
 *  • Converted to SlashCommandBuilder (the raw `default_member_permissions`
 *    property was never forwarded to Discord, so it was admin-in-name-only).
 *  • The original started a `setInterval` that edited a message every 5s and
 *    only stopped when the edit threw. If the message or channel was deleted
 *    the timer leaked and ran forever. Now it self-terminates after N cycles,
 *    clears on message/channel deletion, and clears on shutdown.
 *  • Image URLs are no longer hotlinked from Unsplash with fixed photo IDs
 *    (which 404 and look unrelated to the vehicles); the embed ships without
 *    an external image unless one is configured.
 */
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const perms = require('../../lib/perms');

const VEHICLES = [
    { name: 'Pegassi Zentorno', price: '$725,000', class: 'Super' },
    { name: 'Progen T20', price: '$2,200,000', class: 'Super' },
    { name: 'Grotti Itali GTO', price: '$1,965,000', class: 'Super' },
    { name: 'Ocelot Pariah', price: '$1,420,000', class: 'Sports' },
    { name: 'Benefactor Krieger', price: '$2,875,000', class: 'Super' },
];

const DEFAULT_INTERVAL_MS = 5000;
const MAX_CYCLES = 60; // stop after 5 minutes instead of running forever

module.exports = {
    data: new SlashCommandBuilder()
        .setName('gta-slideshow')
        .setDescription('Show a rotating GTA vehicle & price showcase')
        .addIntegerOption((option) => option
            .setName('seconds')
            .setDescription('Seconds per vehicle (5-30)')
            .setMinValue(5)
            .setMaxValue(30)
            .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false),

    category: 'Admin',

    async execute(interaction) {
        if (!(await perms.requirePermission(interaction, PermissionFlagsBits.Administrator))) return;

        const seconds = interaction.options.getInteger('seconds') ?? DEFAULT_INTERVAL_MS / 1000;
        const intervalMs = seconds * 1000;

        const buildEmbed = (i) => new EmbedBuilder()
            .setColor('#ffaa00')
            .setTitle('🏎️ GTA V Vehicle Showcase')
            .setDescription(`💰 **Price:** ${VEHICLES[i].price}\n🚗 **Vehicle:** ${VEHICLES[i].name}\n🏷️ **Class:** ${VEHICLES[i].class}`)
            .setFooter({ text: `Vehicle ${i + 1} of ${VEHICLES.length} • auto-stops after ${Math.round((MAX_CYCLES * seconds) / 60)} min` })
            .setTimestamp();

        await interaction.deferReply({ ephemeral: true });

        let msg;
        try {
            msg = await interaction.channel.send({ embeds: [buildEmbed(0)] });
        } catch (error) {
            console.error('[gta-slideshow] could not post:', error.message);
            return interaction.editReply({ content: '❌ I could not post the slideshow in this channel.' });
        }

        let index = 0;
        let cycles = 0;

        const stop = () => {
            if (timer) clearInterval(timer);
            timer = null;
        };

        let timer = setInterval(async () => {
            cycles += 1;
            if (cycles >= MAX_CYCLES || !msg || !msg.editable) return stop();
            index = (index + 1) % VEHICLES.length;
            try {
                await msg.edit({ embeds: [buildEmbed(index)] });
            } catch (error) {
                // Message or channel gone — stop cleanly instead of leaking the timer.
                stop();
            }
        }, intervalMs);

        // Stop if the message/channel is deleted while we are running.
        const onDelete = (deleted) => {
            if (deleted && (deleted.id === msg.id || deleted.channelId === msg.channelId)) stop();
        };
        interaction.client.on('messageDelete', onDelete);
        interaction.client.once('shardDisconnect', stop);

        await interaction.editReply({
            content: `🚗 Slideshow started in ${interaction.channel} — ${seconds}s per vehicle, stops automatically after ${Math.round((MAX_CYCLES * seconds) / 60)} min.`,
        });
    },
};
