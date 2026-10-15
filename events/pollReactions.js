/**
 * Poll reaction guard.
 *
 * In the original repo this logic lived inside `commands/utility/poll.js` as a
 * `rawEvent` export that NOTHING ever imported, so it never ran. Even if it had
 * been wired up, the client was created without the `GuildMessageReactions`
 * intent (it appears only in a code comment in the original index.js), so
 * `messageReactionAdd` would never have fired at all. Both problems are fixed:
 * the intent is enabled in index.js and this file is a real event handler.
 *
 * Behaviour: when a member reacts to the bot's own poll message with ✅ or ❌ and
 * they do not hold the configured Verified role, the reaction is removed and they
 * are told why by DM. The check is skipped entirely when verification is not
 * configured for the guild, so it can never strip legitimate votes.
 */
const { Events } = require('discord.js');
const config = require('../lib/config');
const roles = require('../lib/roles');

const POLL_EMOJI = ['✅', '❌'];

module.exports = {
    name: Events.MessageReactionAdd,

    async execute(reaction, user) {
        if (user.bot) return;

        // Offline reactions arrive partial — fetch them before reading anything.
        if (reaction.partial) {
            try {
                await reaction.fetch();
            } catch {
                return;
            }
        }

        const message = reaction.message;
        if (!message.guild) return;
        if (message.author?.id !== reaction.client.user?.id) return;
        if (!POLL_EMOJI.includes(reaction.emoji.name)) return;

        // No verification configured for this guild → nothing to enforce.
        if (!config.roles.verifiedId && !config.roles.verifiedName) return;

        let member;
        try {
            member = await message.guild.members.fetch(user.id);
        } catch {
            // Member is gone; drop the reaction rather than counting a ghost vote.
            await reaction.users.remove(user.id).catch(() => {});
            return;
        }

        if (roles.hasVerifiedRole(member)) return;

        await reaction.users.remove(user.id).catch(() => {});

        try {
            await user.send(
                `❌ You need the **${config.roles.verifiedName}** role in **${message.guild.name}** `
                + 'to vote in polls. Complete verification first.',
            );
        } catch {
            // DMs closed — the removed reaction is the signal on its own.
        }
    },
};
