/**
 * Themed-shop purchase engine.
 *
 * minimarket.js, mobileshop.js and simshop.js each open-coded the same broken
 * purchase flow:
 *
 *     const coinsData = getCoinsData();      // read the balance ONCE
 *     const userCoins = coinsData[userId];
 *     ...
 *     if (userCoins < item.price) reject;    // check against that stale snapshot
 *     ...
 *     coinsData[userId] -= item.price;       // deduct much later (simshop: after
 *     await saveCoinsData(coinsData);        //   a 60-second modal!)
 *
 * Three separate defects fell out of that shape:
 *
 *  1. DOUBLE SPEND — the affordability check used a snapshot taken before any
 *     await. Two concurrent purchases both passed and both deducted from the
 *     same stale value, so one deduction was lost. In simshop.js the gap was up
 *     to 60 seconds wide (the registration modal), during which the balance was
 *     never re-checked — a user could spend the same coins elsewhere and end up
 *     negative.
 *  2. NO REFUND — minimarket.js deducted the coins and then, for a role purchase,
 *     only saved them if `roles.add()` succeeded. If the role add threw, the
 *     deduction was discarded (money back) but the flow had already reported
 *     success paths inconsistently; mobileshop.js did the opposite — it added the
 *     role FIRST and saved afterwards, so a failed save gave the role away free.
 *  3. NO HIERARCHY CHECK — purchasable roles were matched by NAME, with no check
 *     that they sit below the bot. A decoy role named "VIP" or "Master Hacker"
 *     created by anyone with Manage Roles could be bought for coins, and a role
 *     above the bot always failed *after* payment.
 *
 * This module performs every purchase as: deduct atomically → deliver → refund on
 * failure. Nothing is granted before the coins are safely taken, and nothing is
 * taken without being returned if delivery fails.
 */
const store = require('./data');

/** Discord's hard cap on roles per guild. */
const MAX_ROLES_PER_GUILD = 250;

/**
 * Resolve a purchasable role safely.
 * @returns {{role?: import('discord.js').Role, error?: string}}
 */
function resolvePurchasableRole(guild, roleName) {
    if (!guild) return { error: 'This purchase only works inside a server.' };

    const role = guild.roles.cache.find((r) => r.name.toLowerCase() === String(roleName).toLowerCase());
    if (!role) {
        return { error: `The role **${roleName}** does not exist in this server. Ask an admin to create it first.` };
    }

    const botTop = guild.members.me?.roles?.highest;
    if (!botTop || role.position >= botTop.position) {
        return { error: `**${roleName}** is at or above my highest role, so I cannot grant it. Ask an admin to move my role up.` };
    }

    // Refuse to sell privileged roles — a coin shop must not be an escalation path.
    const DANGEROUS = [
        'Administrator', 'ManageGuild', 'ManageRoles', 'ManageChannels',
        'BanMembers', 'KickMembers', 'ModerateMembers', 'ManageWebhooks',
    ];
    for (const flag of DANGEROUS) {
        if (role.permissions.has(flag)) {
            return { error: `**${roleName}** holds the ${flag} permission and cannot be purchased with coins.` };
        }
    }

    return { role };
}

/**
 * Buy an item atomically.
 *
 * @param {object} opts
 * @param {import('discord.js').Guild} opts.guild
 * @param {import('discord.js').GuildMember} opts.member
 * @param {string} opts.userId
 * @param {{price:number, type:'item'|'role', roleName?:string, key?:string}} opts.item
 * @returns {Promise<{ok:boolean, balance:number, error?:string, granted?:string}>}
 */
async function purchase({ guild, member, userId, item }) {
    const price = Math.max(0, Math.round(Number(item.price) || 0));

    // 1. Deduct FIRST, atomically. `store.spend` refuses when funds are short,
    //    so the balance is re-checked at deduction time, not from a stale read.
    const { ok, balance } = await store.spend(userId, price);
    if (!ok) {
        return { ok: false, balance, error: 'insufficient' };
    }

    // 2. Deliver.
    try {
        if (item.type === 'role') {
            const resolved = resolvePurchasableRole(guild, item.roleName);
            if (resolved.error) {
                // Refund — the coins were taken but nothing was delivered.
                await store.addBalance(userId, price);
                return { ok: false, balance: await currentBalance(userId), error: resolved.error };
            }
            if (member.roles.cache.has(resolved.role.id)) {
                await store.addBalance(userId, price);
                return { ok: false, balance: await currentBalance(userId), error: `You already own **${resolved.role.name}**.` };
            }
            await member.roles.add(resolved.role.id, `Purchased ${item.roleName} for ${price} coins`);
            return { ok: true, balance: await currentBalance(userId), granted: resolved.role.name };
        }

        // Physical/inventory item — record it so /inventory reflects the purchase.
        const key = item.key || String(item.roleName || 'item').toLowerCase().replace(/\s+/g, '_');
        await store.addItem(userId, key, 1);
        return { ok: true, balance: await currentBalance(userId), granted: key };
    } catch (error) {
        // 3. Delivery failed — refund in full.
        console.error('[purchase] delivery failed, refunding:', error.message);
        await store.addBalance(userId, price);
        return {
            ok: false,
            balance: await currentBalance(userId),
            error: 'Delivery failed (check my role position and permissions). Your coins have been refunded.',
        };
    }
}

async function currentBalance(userId) {
    return store.getWallet(userId);
}

/**
 * Apply a random cashback bonus, clamped so a misconfigured bonus cannot mint
 * coins out of thin air.
 */
async function applyBonus(userId, min, max, cap) {
    const lo = Math.max(0, Math.round(Number(min) || 0));
    const hi = Math.max(lo, Math.round(Number(max) || 0));
    // An explicit cap of 0 means "pay no bonus". Only an absent/non-numeric cap
    // falls back to `hi` — `Number(cap) || hi` would have turned 0 into hi and
    // silently re-enabled an uncapped payout.
    const capValue = Number(cap);
    const limit = Number.isFinite(capValue)
        ? Math.max(0, Math.round(Math.abs(capValue)))
        : hi;
    const bonus = Math.min(Math.floor(Math.random() * (hi - lo + 1)) + lo, limit);
    if (bonus <= 0) return { bonus: 0, balance: store.getWallet(userId) };
    const balance = await store.addBalance(userId, bonus);
    return { bonus, balance };
}

module.exports = { purchase, resolvePurchasableRole, applyBonus, MAX_ROLES_PER_GUILD };
