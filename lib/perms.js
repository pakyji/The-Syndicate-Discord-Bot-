/**
 * Permission helpers.
 *
 * The root cause of the privilege-escalation bug was that index.js registered
 * slash commands WITHOUT `default_member_permissions`, so Discord offered
 * /ban, /dm, /announcement etc. to every member. index.js now forwards that
 * field — but registration alone is not a security boundary: anyone with
 * Manage Guild can override per-command permissions in Server Settings, and
 * commands invoked from a DM context bypass it entirely.
 *
 * So every sensitive command ALSO calls `requirePermission()` at runtime.
 * Defence in depth.
 */
const { PermissionFlagsBits } = require('discord.js');

/**
 * command name -> minimum Discord permission.
 * Used by events/interactionCreate.js as a central pre-flight gate so a new
 * command cannot accidentally ship without a check.
 */
const COMMAND_PERMISSIONS = {
    // Administrator
    announcement: PermissionFlagsBits.Administrator,
    coinparty: PermissionFlagsBits.Administrator,
    dm: PermissionFlagsBits.Administrator,
    giveaway: PermissionFlagsBits.Administrator,
    'gta-slideshow': PermissionFlagsBits.Administrator,
    reactionroles: PermissionFlagsBits.Administrator,
    refresh: PermissionFlagsBits.Administrator,
    setup: PermissionFlagsBits.Administrator,
    'verify-members': PermissionFlagsBits.Administrator,
    promote: PermissionFlagsBits.Administrator,

    // Ban / moderate
    ban: PermissionFlagsBits.BanMembers,
    unban: PermissionFlagsBits.BanMembers,
    mute: PermissionFlagsBits.ModerateMembers,
    unmute: PermissionFlagsBits.ModerateMembers,
    warn: PermissionFlagsBits.ModerateMembers,
    clearwarn: PermissionFlagsBits.ModerateMembers,
    kick: PermissionFlagsBits.KickMembers,

    // Manage
    clear: PermissionFlagsBits.ManageMessages,
    say: PermissionFlagsBits.ManageMessages,
    poll: PermissionFlagsBits.ManageMessages,
    id: PermissionFlagsBits.ManageMessages,
    twitch: PermissionFlagsBits.ManageChannels,
    antilink: PermissionFlagsBits.ManageGuild,
    antibadwords: PermissionFlagsBits.ManageGuild,
    antispam: PermissionFlagsBits.ManageGuild,
    setupverify: PermissionFlagsBits.ManageGuild,

    // Public
    // Music, version and changelog are public on purpose: music is gated by
    // *being in the voice channel the player is in* (see lib/music.js
    // checkVoiceContext), not by a Discord permission. Listing them as `null`
    // keeps the map complete so the validator can prove nothing is ungated by
    // accident — an unlisted command is indistinguishable from a forgotten one.
    music: null,
    version: null,
    changelog: null,
    balance: null,
    help: null,
    ping: null,
    level: null,
    leaderboard: null,
    report: null,
    inventory: null,
    mine: null,
    shop: null,
    slots: null,
    coinflip: null,
    syndicate: null,
    minimarket: null,
    mobileshop: null,
    simshop: null,
    jackpot: null,
    gtsos: null,
    serverinfo: null,
    suggestion: null,
    uptime: null,
    userinfo: null,
    // Fun commands (no API key required)
    joke: null,
    quote: null,
    anime: null,
    meme: null,
    '8ball': null,
    cat: null,
    dog: null,
};

/** True if this command has no gate (public). */
function isPublic(commandName) {
    return COMMAND_PERMISSIONS[commandName] === null;
}

/**
 * Runtime gate. Replies ephemerally and returns false when the caller lacks
 * the permission, so handlers can simply `if (!ok) return;`.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {bigint} permission PermissionFlagsBits value
 * @param {string} [label] human-readable name for the error message
 */
async function requirePermission(interaction, permission, label) {
    if (!permission) return true;

    const name = label || describePermission(permission);

    // DMs have no member permissions at all.
    if (!interaction.inGuild() || !interaction.member) {
        await safeReply(interaction, `❌ \`/${interaction.commandName}\` can only be used inside a server.`);
        return false;
    }

    const member = interaction.member;
    const perms = member.permissions;
    const allowed = perms && typeof perms.has === 'function'
        ? perms.has(permission)
        : false;

    // Server owner always passes.
    if (!allowed && interaction.guild && member.id === interaction.guild.ownerId) return true;

    if (!allowed) {
        await safeReply(interaction, `❌ You need the **${name}** permission to use \`/${interaction.commandName}\`.`);
        return false;
    }
    return true;
}

/** Central pre-flight used by interactionCreate for every chat-input command. */
async function gateCommand(interaction) {
    const required = COMMAND_PERMISSIONS[interaction.commandName];
    if (required === undefined) {
        // Unknown command — let the normal "command not found" path handle it.
        return true;
    }
    if (required === null) return true;
    return requirePermission(interaction, required);
}

/** True when `member` outranks or equals `target` — prevents mod-on-mod abuse. */
function canModerate(member, target) {
    if (!member || !target) return false;
    if (member.id === target.id) return false;
    if (member.guild && member.id === member.guild.ownerId) return true;
    const a = member.roles && member.roles.highest;
    const b = target.roles && target.roles.highest;
    if (!a || !b) return false;
    return a.position > b.position;
}

function describePermission(permission) {
    const entries = Object.entries(PermissionFlagsBits);
    for (const [name, value] of entries) {
        if (BigInt(value) === BigInt(permission)) return name.replace(/([A-Z])/g, ' $1').trim();
    }
    return 'required';
}

async function safeReply(interaction, content) {
    try {
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content, ephemeral: true });
        } else {
            await interaction.reply({ content, ephemeral: true });
        }
    } catch {
        /* interaction may have expired — nothing useful to do */
    }
}

module.exports = {
    COMMAND_PERMISSIONS,
    requirePermission,
    gateCommand,
    canModerate,
    isPublic,
    describePermission,
    safeReply,
};
