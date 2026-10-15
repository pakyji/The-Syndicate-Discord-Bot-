/**
 * The Syndicate — entry point.
 *
 * Key fixes vs. the original:
 *  1. `default_member_permissions` is now forwarded to Discord when registering
 *     commands. Previously only {name, description, options} were sent, which
 *     silently dropped the Administrator/ModerateMembers gate on 18 commands and
 *     exposed /ban, /dm, /announcement, /antilink ... to every member.
 *  2. Legacy `{name, execute}` commands keep their declared options and
 *     permissions instead of registering with zero options (which made /clear
 *     and /kick impossible to use as intended).
 *  3. require() of each command/event is wrapped in try/catch, so one broken
 *     file can no longer abort the whole boot.
 *  4. Presence rotation and command registration use `once`, not a second
 *     `client.once('ready')` competing with the events in /events.
 *  5. Startup validation reports missing env vars instead of failing obscurely.
 */
const fs = require('fs');
const path = require('path');
const {
    Client, GatewayIntentBits, Partials, Collection, REST, Routes, ActivityType,
} = require('discord.js');

const config = require('./lib/config');
const music = require('./lib/music');

/* ------------------------------------------------------------------ *
 * Boot validation — fail fast with a readable message
 * ------------------------------------------------------------------ */
if (!config.token) {
    console.error('\n❌ DISCORD_TOKEN is not set. Copy .env.example to .env and fill it in.\n');
    process.exit(1);
}
for (const problem of config.validate()) {
    console.warn(`⚠️  ${problem}`);
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,   // privileged — required for moderation/XP
        GatewayIntentBits.GuildMembers,     // privileged — required for verification
        GatewayIntentBits.GuildVoiceStates,
        // Required for the poll reaction guard (events/pollReactions.js). The
        // original listed this intent in a code comment only — it was never passed
        // to the client, so `messageReactionAdd` never fired and every reaction
        // handler in the repo was dead code. Enable "MESSAGE REACTION INTENT" in
        // the developer portal as well, or the gateway will reject the session.
        GatewayIntentBits.GuildMessageReactions,
    ],
    // Without these, reactions added while the bot was offline arrive as
    // "partial" objects with no emoji name, and the guard silently skipped them.
    partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

client.commands = new Collection();
/**
 * Upstream created `client.musicQueues = new Map()` and nothing ever read it —
 * that Map was the entire music "feature". It is now a live view of the real
 * per-guild queues owned by lib/music.js, exposed for debugging.
 */
client.musicQueues = music.queues;
// Kept for backwards compatibility, but warnings are now persisted via lib/data.
client.autoWarnings = new Map();

/* ------------------------------------------------------------------ *
 * Command loader
 * ------------------------------------------------------------------ */
const commandsArray = [];

function normaliseCommand(command) {
    // discord.js SlashCommandBuilder path
    if (command && command.data) {
        const json = typeof command.data.toJSON === 'function' ? command.data.toJSON() : command.data;
        return {
            name: json.name,
            description: json.description,
            options: json.options || [],
            default_member_permissions:
                json.default_member_permissions != null ? String(json.default_member_permissions) : null,
            dm_permission: json.dm_permission === false ? false : undefined,
            nsfw: json.nsfw === true ? true : undefined,
            module: command,
        };
    }

    // Legacy `{ name, description, options, default_member_permissions }` path.
    // The original pushed `options: []` here, which stripped every argument.
    if (command && typeof command.name === 'string') {
        return {
            name: command.name,
            description: command.description || 'No description provided',
            options: Array.isArray(command.options) ? command.options : [],
            default_member_permissions:
                command.default_member_permissions != null ? String(command.default_member_permissions) : null,
            dm_permission: command.dm_permission === false ? false : undefined,
            nsfw: command.nsfw === true ? true : undefined,
            module: command,
        };
    }

    return null;
}

function loadCommands(dir) {
    let files;
    try {
        files = fs.readdirSync(dir);
    } catch (error) {
        console.error(`[loader] cannot read ${dir}:`, error.message);
        return;
    }

    for (const file of files) {
        const filePath = path.join(dir, file);

        let stat;
        try {
            stat = fs.statSync(filePath);
        } catch {
            continue;
        }

        if (stat.isDirectory()) {
            loadCommands(filePath);
            continue;
        }
        if (!file.endsWith('.js')) continue;

        let command;
        try {
            command = require(filePath);
        } catch (error) {
            // One broken file must not take the whole bot down.
            console.error(`[loader] failed to load command ${filePath}:`, error.message);
            continue;
        }

        const normalised = normaliseCommand(command, filePath);

        if (!normalised || !normalised.name || normalised.name === 'undefined'
            || typeof (normalised.module.execute || normalised.module.run) !== 'function') {
            console.warn(`[loader] ⚠️  skipped invalid command file: ${path.relative(__dirname, filePath)}`);
            continue;
        }

        if (client.commands.has(normalised.name)) {
            console.warn(`[loader] ⚠️  duplicate command name "${normalised.name}" in ${path.relative(__dirname, filePath)} — ignored`);
            continue;
        }

        client.commands.set(normalised.name, normalised.module);

        const payload = {
            name: normalised.name,
            description: normalised.description || 'No description provided',
            options: normalised.options,
        };
        // ⭐ The critical fix: without this, permission gates never reach Discord.
        if (normalised.default_member_permissions != null) {
            payload.default_member_permissions = normalised.default_member_permissions;
        }
        if (normalised.dm_permission !== undefined) payload.dm_permission = normalised.dm_permission;
        if (normalised.nsfw !== undefined) payload.nsfw = normalised.nsfw;

        commandsArray.push(payload);
    }
}

/* ------------------------------------------------------------------ *
 * Event loader
 * ------------------------------------------------------------------ */
function loadEvents(dir) {
    let files;
    try {
        files = fs.readdirSync(dir);
    } catch (error) {
        console.error(`[loader] cannot read ${dir}:`, error.message);
        return;
    }

    const counts = new Map();

    for (const file of files.sort()) {   // deterministic order, not FS-dependent
        const filePath = path.join(dir, file);

        let stat;
        try {
            stat = fs.statSync(filePath);
        } catch {
            continue;
        }
        if (stat.isDirectory()) {
            loadEvents(filePath);
            continue;
        }
        if (!file.endsWith('.js')) continue;

        let event;
        try {
            event = require(filePath);
        } catch (error) {
            console.error(`[loader] failed to load event ${filePath}:`, error.message);
            continue;
        }

        if (!event || !event.name || typeof event.execute !== 'function') {
            console.warn(`[loader] ⚠️  skipped invalid event file: ${path.relative(__dirname, filePath)}`);
            continue;
        }

        counts.set(event.name, (counts.get(event.name) || 0) + 1);

        // Wrap so one throwing handler cannot break its siblings.
        const handler = async (...args) => {
            try {
                await event.execute(...args, client);
            } catch (error) {
                console.error(`[event:${event.name}] ${file} threw:`, error);
            }
        };

        if (event.once) client.once(event.name, handler);
        else client.on(event.name, handler);
    }

    for (const [name, count] of counts) {
        if (count > 1) {
            console.log(`[loader] ℹ️  ${count} handlers registered for "${name}"`);
        }
    }
}

loadCommands(path.join(__dirname, 'commands'));
loadEvents(path.join(__dirname, 'events'));

console.log(`[loader] ${client.commands.size} commands, ${commandsArray.length} to register`);

/* ------------------------------------------------------------------ *
 * Slash-command registration (runs once, after ready)
 * ------------------------------------------------------------------ */
let commandsRegistered = false;

async function registerCommands() {
    if (commandsRegistered) return;
    commandsRegistered = true;

    // De-duplicate defensively, preserving the last definition.
    const unique = Array.from(new Map(commandsArray.map((c) => [c.name, c])).values());

    const rest = new REST({ version: '10' }).setToken(config.token);
    const gated = unique.filter((c) => c.default_member_permissions != null).length;

    try {
        if (config.guildId) {
            await rest.put(Routes.applicationGuildCommands(client.user.id, config.guildId), { body: unique });
            console.log(`✅ Registered ${unique.length} guild commands instantly (${gated} permission-gated).`);
        } else {
            await rest.put(Routes.applicationCommands(client.user.id), { body: unique });
            console.log(`✅ Registered ${unique.length} global commands (${gated} permission-gated). Global rollout can take up to 1 hour.`);
        }
    } catch (error) {
        // Let a later boot retry instead of marking it done forever.
        commandsRegistered = false;
        console.error('[register] command registration failed:', error.message);
    }
}

client.once('ready', async () => {
    await registerCommands();

    // Rotating presence
    const statuses = config.statuses.map((name) => ({ name, type: ActivityType.Playing }));
    if (statuses.length) {
        let index = 0;
        // ⭐ setPresence()/setActivity()/setStatus() are SYNCHRONOUS in discord.js
        // v14: they return a Presence object, NOT a Promise. There is nothing to
        // .catch() — and an earlier version did exactly that, so every rotation tick
        // threw `TypeError: ...catch is not a function` inside this timer. An
        // uncaught exception in a timer callback kills the whole process, so the
        // host restart-looped the bot and every restart dropped live voice
        // connections (which is why music "never played"). Presence is cosmetic:
        // it must never be able to take the bot down.
        const applyPresence = (activity) => {
            try {
                client.user?.setPresence({ activities: [activity], status: 'online' });
            } catch { /* cosmetic only — never worth a restart */ }
        };
        applyPresence(statuses[0]);

        const timer = setInterval(() => {
            index = (index + 1) % statuses.length;
            applyPresence(statuses[index]);
        }, config.statusRotateMs);
        timer.unref?.();
    }

    console.log(`✅ The Syndicate is online as ${client.user.tag}`);
});

/* ------------------------------------------------------------------ *
 * Graceful shutdown — flush in-flight writes before exiting
 * ------------------------------------------------------------------ */
function shutdown(signal) {
    console.log(`\n[shutdown] ${signal} received, closing gateway…`);
    // Stop audio and leave voice channels first: destroying the client while a
    // voice connection is live leaves the guild with a ghost connection.
    try {
        music.destroyAll(`${signal} — leaving voice channels.`);
    } catch { /* ignore */ }
    try {
        client.destroy();
    } catch { /* ignore */ }
    process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

client.login(config.token);
