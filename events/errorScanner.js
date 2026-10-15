/**
 * Process-level error handling.
 *
 * Fixes vs. the original:
 *  • `uncaughtException` NO LONGER keeps the process alive. After an uncaught
 *    exception Node's state is undefined; the original logged it and carried on,
 *    so the bot kept running with possibly-corrupted in-memory data and then
 *    persisted that corruption to disk. We now log, attempt a final flush, and
 *    exit(1) so the supervisor (pm2 / systemd / Docker) restarts cleanly.
 *  • Stack traces are REDACTED before being posted to Discord. The original sent
 *    raw stacks to a channel, and stacks routinely contain env values, tokens in
 *    request URLs, file paths and user IDs.
 *  • The log channel is configurable and is treated as a private staff channel.
 *  • Handlers are registered once, guarded against re-entrancy.
 */
const { Events, EmbedBuilder } = require('discord.js');
const config = require('../lib/config');
const { formatError } = require('../lib/logger');

let shuttingDown = false;

async function sendErrorLog(client, errorType, error) {
    if (!config.channels.errorLog) return;

    try {
        const logChannel = await client.channels.fetch(config.channels.errorLog).catch(() => null);
        if (!logChannel || !logChannel.isTextBased()) return;

        const embed = new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle('🚨 Bot System Error')
            .setDescription(
                `**Type:** \`${errorType}\`\n\n**Details:**\n\`\`\`js\n${formatError(error)}\n\`\`\``,
            )
            .setTimestamp();

        await logChannel.send({ embeds: [embed] });
    } catch (err) {
        // Never let the error reporter itself throw.
        console.error('[errorScanner] could not deliver log:', err.message);
    }
}

module.exports = {
    name: Events.ClientReady,
    once: true,

    async execute(client) {
        console.log(`🛡️ Error scanner active for ${client.user.tag} (log channel: ${config.channels.errorLog || 'none'})`);

        // Recoverable: a rejected promise nobody awaited. Log and continue.
        process.on('unhandledRejection', async (reason) => {
            console.error('[unhandledRejection]', reason);
            await sendErrorLog(client, 'Unhandled Rejection', reason instanceof Error ? reason : new Error(String(reason)));
        });

        // NOT recoverable: log, flush, exit.
        process.on('uncaughtException', async (error) => {
            console.error('[uncaughtException]', error);
            if (shuttingDown) return;
            shuttingDown = true;

            try {
                await sendErrorLog(client, 'Uncaught Exception — restarting', error);
            } finally {
                // Give the log a moment to send, then exit so the supervisor restarts us.
                const timer = setTimeout(() => process.exit(1), 2000);
                timer.unref?.();
                try { client.destroy(); } catch { /* ignore */ }
                process.exit(1);
            }
        });
    },
};
