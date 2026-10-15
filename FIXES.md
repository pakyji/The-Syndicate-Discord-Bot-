# 🛠️ The Syndicate — Complete Fix Report

**Repo:** `pakyji/The-Syndicate-Discord-Bot-` @ `7f65d73`
**Fixed tree:** `/home/user/fixed/`
**Patch:** `/home/user/patches/the-syndicate-fixes-full.patch` (verified to apply cleanly on a pristine upstream clone)

> **This report covers three passes.**
> * **Sections 1–11** fix the upstream repository.
> * **Section 12** is a second audit of the fixed tree itself — it re-read every file the
>   first pass only touched with automated codemods, then wrote tests against malformed
>   input. It found **11 more real defects, five of which the first pass introduced
>   itself**, including two that could destroy or wipe live data.
> * **Section 13** is new functionality: YouTube **music**, an automatic
>   **version-change announcement**, `/version` + `/changelog`, the GitHub publishing
>   material, and deployment guides for a server and for a phone (Termux). It also
>   hardens the static validator and adds a silent-drop audit so the class of bug that
>   section 12 kept finding cannot come back quietly.

```
Final diff vs. upstream 7f65d73:  104 files changed, 15939 insertions(+), 3618 deletions(-)
Fixed tree:                       84 JS files, ~12,500 lines, 46 commands, 17 event handlers
```

---

## ✅ Verification results

| Check | Result |
|---|---|
| `npm install` from a fresh clone | ✅ 151 packages, 0 errors |
| Boot (`node index.js`) | ✅ loads **46 commands** / 6 event types, **no duplicate-command warnings**, reaches Discord gateway |
| `npm run check` (static validator) | ✅ 79 files, 43 commands — no blocking issues |
| `npm run lint` (eslint) | ✅ **0 problems** |
| Runtime test suite | ✅ **274 passed, 0 failed** (was 43 before the second pass) |
| Silent-drop audit (duplicate command names, malformed events, dead lib modules, Discord option limits) | ✅ clean |
| `git apply --check` on pristine upstream clone | ✅ passes |
| Applied tree vs. fixed tree | ✅ byte-identical |

The 274 runtime assertions cover: atomic writes, corrupt-file quarantine, 50 concurrent
increments with zero lost updates, double-spend blocking, inventory add/remove guards,
XP persistence and level-ups, warning add/remove/renumber/clear, per-guild settings
isolation, bounded cooldown eviction, permission-map completeness, secret redaction
(7 token/webhook/JWT/bearer/URI shapes), invite-cache sharing —
plus, from the second pass: the atomic purchase engine (10-way concurrent double-spend,
the stale-snapshot overspend, exact refunds on failed delivery), purchasable-role
hierarchy and privilege refusals, cashback clamping, prize-event parameter bounds,
command-level option bounds for `/jackpot`, `/coinparty` and `/poll`, single-sourced
duration parsing, the `/syndicate` per-user state read, recovery from seven different
malformed `store.json` shapes, the music engine's limits and queue operations, the
version-announcement decision matrix, and — driven against a **mock gateway client** —
the full announcement flow: first deploy with `@everyone`, a silent same-version
restart, an update naming the previous version, a missing *Mention Everyone* permission
dropping the ping instead of sending it broken, a failed send not being recorded, an
unusable channel degrading silently, and the hourly redeploy cap.

---

## 🔴 CRITICAL — fixed

### 1. All 18 admin permission gates were stripped at registration
`index.js` built the command payload by hand and sent only `{name, description, options}`,
so `setDefaultMemberPermissions(...)` never reached Discord. `/ban`, `/dm`,
`/announcement`, `/antilink` and 14 others were usable by **every member**.

**Fixed two ways (defence in depth):**
- `index.js` now forwards `default_member_permissions`, `dm_permission` and `nsfw`.
- New `lib/perms.js` holds a central command→permission map, and
  `events/interactionCreate.js` runs `perms.gateCommand()` **before dispatching any
  command**. Registration alone is not a boundary — anyone with Manage Server can
  override it in Server Settings, and DM invocations bypass it.
- Every sensitive command *also* calls `perms.requirePermission()` inside `execute()`.
- `commands/refresh.js` had the identical payload bug — running it re-wiped every gate.
  It now forwards permissions too and reports how many commands are gated.
- `scripts/validate.js` fails the build if any command declares a gate but never
  checks it at runtime, so this cannot silently regress.

### 2. `commands/moderation/warn.js` opened a second gateway session
It was a copy-paste of `antispam.js`, not a warn command: it built its own
`new Client()` and called `client.login(process.env.DISCORD_TOKEN)` at module scope.
`index.js` `require()`d it, so two sessions ran on one token → Discord invalidated the
older one → endless reconnect loop. It also had no `module.exports`, so `/warn` never
existed.

**Fixed:** rewritten as a real `/warn` command with persistent warnings, role-hierarchy
checks and auto-escalation at 3 / 5 / 8 warnings. Root-level `antispam.js` (dead code,
same `client.login()` hazard) deleted. The validator now **errors** on any file outside
`index.js` that calls `client.login()` or constructs a `Client`.

### 3. Bot could not start from a fresh clone
`axios` (2 files) and `node-cron` (1 file) were `require()`d but undeclared;
`@discordjs/voice` and `translate-google-api` were declared but unused.

**Fixed:** `package.json` corrected, `package-lock.json` committed for reproducibility,
`require()` wrapped in try/catch so one broken module cannot abort boot, and
`scripts/validate.js` fails on any undeclared dependency.

### 4. `/clear` — no permission check, no arguments
Legacy format registered it with zero options, so `amount` never existed; any member
could purge 5 messages and errors were swallowed.

**Fixed:** proper `SlashCommandBuilder`, `ManageMessages`-gated (registration + runtime),
amount clamped to Discord's 1–100 bulk limit, optional per-user filter, 14-day boundary
handled, and the reply reports how many messages were *actually* deleted.

---

## 🟠 HIGH — fixed

### 5. Non-atomic persistence (47 raw `writeFileSync` calls)
New `lib/store.js`: writes to `<file>.tmp` then `rename()` (atomic), every read/write in
try/catch, corrupt JSON quarantined as `*.corrupt-<ts>.json` instead of crashing, and a
**per-file mutex** so read-modify-write cycles cannot interleave. Verified: 50 concurrent
increments → exactly 50.

### 6. Four disconnected coin databases
`coins.json` (earning), `economyStorage.json` (spending), `syndicateStorage.json`,
`twitchConfig.json` never agreed — `/balance` could show 500 while `/shop` saw 0.
Three of the paths were also **CWD-relative** (`'./coins.json'`), so launching from
another directory silently created a second empty data file.

**Fixed:** one store at `data/store.json` with a single schema. Legacy files migrate
automatically on first boot (`lib/data.js`), and `lib/twitchConfig.js`
keep the old function names working while routing into the unified store. Twitch config
is now per-guild instead of global.

### 7. Levels were memory-only and `/level` returned fake data
`events/levelSystem.js` used an in-memory `Map` (wiped on restart) and `/level` returned
a hardcoded string with no XP at all.

**Fixed:** XP, level and rank persist in the store. `/level` now shows real level, an XP
progress bar, rank and coins. Cooldowns use a bounded expiry-timestamp tracker (no timer
per user, evicts stale entries).

### 8. Warnings were memory-only
`client.autoWarnings` in `index.js` — every restart cleared all moderation history.

**Fixed:** warnings persist per user with reason, moderator, guild and timestamp.
`/clearwarn` renumbers remaining warnings so IDs stay stable for mods.

### 9. Coin drops were announced but never credited
`events/ready.js` posted "🪙 Automatic Coin Drop!" with a claim button and a collector
that edited the embed to say the user won — but **no balance write existed anywhere**.
`claim_coin_auto` had no handler in the repo.

**Fixed:** claims go through `data.addBalance()`, the winner's new balance is shown, the
claim guard is atomic (no `await` between check and assign), a failed save reopens the
claim instead of losing it, and the interval is cleared on shutdown.

### 10. Three competing invite caches — attribution never worked
`inviteTracker.js` used a module-level `Collection`, `ready.js` used
`global.invitesCache`, and `guildMemberAdd.js` captured `global.invitesCache || new Map()`
**at module load time** — before login, so it held a permanently empty Map. "Invited By"
always read *"Unknown / Direct Link"*.

**Fixed:** one shared cache in `lib/invites.js` with proper diffing, vanity-URL fallback
and cache refresh.

### 11. `uncaughtException` swallowed and stack traces leaked
`errorScanner.js` logged and continued, so the bot limped on with corrupted state and
persisted it. It also posted raw stacks to a Discord channel.

**Fixed:** `lib/logger.js` redacts tokens, webhooks, JWTs, bearer headers, `key=value`
secrets, connection strings and absolute paths before anything leaves the process
(verified against 7 secret shapes; snowflakes and normal text are preserved).
Uncaught exceptions now log, flush, and `process.exit(1)` so a supervisor restarts cleanly.
`interactionCreate.js` no longer echoes `error.message` to users.

---

## 🟡 MEDIUM — fixed

| # | Finding | Fix |
|---|---|---|
| 12 | `/mine` **crashed on every call after the first** — `now` was read before its `const` declaration (temporal dead zone) | Rewritten; cooldown check ordered correctly, atomic reward write |
| 13 | `/announcement` set `allowedMentions: { parse: ['everyone'] }` **unconditionally**, so `@everyone` in the body pinged the server even with "None" selected | `allowedMentions` derived from the ping choice; body mention-escaped otherwise; `MentionEveryone` pre-checked; lengths capped |
| 14 | `/say` passed raw text to `channel.send()`, and replied "success" before sending | Mentions suppressed by default; `allow_pings` opt-in requires Manage Guild; length capped; error path handled |
| 15 | `/twitch test` sent `@everyone` with only **ManageChannels** | Pinging now requires Manage Messages explicitly and is opt-in; test embed clearly labelled TEST |
| 16 | `/setup` called `permissionOverwrites.set([...])` — which **replaces** the overwrite list, wiping moderator/staff/private-channel permissions on every channel | Now **merges** via `permissionOverwrites.edit()`, previews a dry run first, requires `confirm:true`, can skip channels/categories, rate-limit aware |
| 17 | `mediaEmbed.js` **deleted members' own messages** whenever they contained a Spotify/TikTok/YouTube link, in every channel; regexes recompiled per message | Disabled by default (`MEDIA_EMBED_ENABLED`), channel-restricted, opt-in deletion, regexes compiled once |
| 18 | Translation sent message content to a third-party API, then **deleted the author's original**; no timeout, no null-guard (MyMemory quota errors threw) | Timeout added, `responseStatus` checked, per-user rate limit, one-time privacy notice, deletion off by default, channel from config |
| 19 | `helperSetup.js` auto-created a "Helper" role and granted it to a hardcoded user **on every boot** | Disabled by default; replaced by an explicit, audited `/promote` command that refuses roles at/above the bot's own or holding Administrator |
| 20 | Roles matched by **name** (`'Verified'`) — anyone with Manage Roles could make a decoy | `lib/roles.js` resolves by configured ID first, name only as fallback |
| 21 | 21 hardcoded snowflakes across 11 files | All moved to `lib/config.js` + `.env`; defaults preserve the old values so existing deployments keep working |
| 22 | `client.guilds.cache.first()` assumed a single guild | Explicit `GUILD_ID` resolution |
| 23 | Giveaway modal handler never re-verified the submitter (custom IDs are user-supplied); Verified-role check was skipped entirely when the role was missing | Admin re-checked on submit; missing role is now a hard fail; duration validated (10s–21d, see §12.9); entries persisted |
| 24 | `/reactionroles` auto-created **8 roles on every run** (Discord's cap is 250) | Creation is opt-in via `create_missing:true`; reports created/missing/unusable roles; refuses roles at/above the bot or holding Administrator |
| 25 | `/dm` had no rate limiting or audit trail | Per-admin cooldown + daily cap (50), every use logged to the staff channel with the real sender even when "anonymous" |
| 26 | `/report` had no throttle (each report DMs all staff) and 54 lines of dead `handleInteraction()` never called by the loader | 60s cooldown, dead code removed, reports also mirrored to the report channel so they are never lost |
| 27 | **No anti-spam listener existed at all** — the only implementation was the dead root `antispam.js`, and `/antispam` toggled a module variable nothing read | New `events/antispamListener.js`: flood, duplicate-content and mention-spam detection; `/antispam` now persists per guild with `toggle` / `config` / `status` |
| 28 | `/antispam` status reset to ON on every restart; settings were global across servers | Per-guild, persisted, with tunable thresholds |
| 29 | `antilinkListener.js` used a module-scoped `/g/` RegExp with `.test()` — `lastIndex` persisted, so it **alternated true/false and let ~half of all links through** | Pattern constructed per message; staff bypass; per-guild settings; the validator now warns on this pattern |
| 30 | `/antilink` and `/antibadwords` could only ever **add** entries | Added `remove` and `list`; input validated and length-capped; shipped placeholders (`badword1`) ignored |
| 31 | `guildMemberAdd.js` created a private channel on **every join** with no cap or cleanup — a raid wave pushes toward Discord's 500-channel limit | Capped at 25 concurrent, skipped for bots, stale channels pruned after 24h, near-limit guard, sanitised channel names, reuses an existing channel |
| 32 | `verifiedPingtask.js` called `guild.members.fetch()` every 30 min and used `Europe/Paris` while greetings used `Europe/Rome` | Uses the cached member list, presence-aware, per-member 12h cooldown, `allowedMentions` restricted to picked users, timezone unified |
| 33 | `timeGreetings.js` used cache-only channel lookup (greetings silently skipped after a restart) and `node-cron` was undeclared | Fetch fallback, cron jobs tracked and stopped on shutdown, dependency declared |
| 34 | `gtsos.js` posted the LFG menu into a hardcoded ID that is actually the **error-log channel** | Config-driven, defaults to the LFG channel, permission-gated, SendMessages pre-checked |
| 35 | 7 commands used the legacy `{name, execute}` shape and registered with **zero options** | All converted to `SlashCommandBuilder` (`clear`, `kick`, `ping`, `help`, `setupverify`, `verify-members`, `gtsos`); `giveaway`, `gta-slideshow` too |
| 36 | Event names inconsistent (`'ready'` vs `Events.ClientReady`, `'messageCreate'` vs `Events.MessageCreate`) | Normalised to the `Events.*` enum throughout |
| 37 | Unbounded in-memory Maps + one `setTimeout` per user (`coinSystem`, `levelSystem`, `userSelections`) | `lib/cooldowns.js`: expiry timestamps (no timers), size caps, eviction; SOS selections expire after 15 min |
| 38 | `/giveaway` accepted any duration string with no upper bound | Validated and single-sourced in `lib/duration.js`; the first pass capped it at 30d, which **overflowed Node's int32 timer** — corrected to 21d in §12.9 |
| 39 | `gtaslideshow.js` leaked a `setInterval` forever if the message was deleted, and hotlinked unrelated Unsplash photos as "vehicle images" | Self-terminates after 60 cycles, stops on message/channel delete and shutdown, external images removed |
| 40 | Item catalog duplicated across 5 shop files and drifting | Single source of truth in `lib/economy.js`; `/shop` choices generated from it |
| 41 | `/balance`, `/leaderboard` did unguarded numeric sorts (NaN scrambles order) and showed members who had left | Coerced, filtered, names resolved, bots excluded |
| 42 | `guildMemberRemove.js` used deprecated `member.user.tag` (renders `username#0` on migrated accounts) and duplicated the stats logic | Uses `username`; stats shared via `lib/guildStats.js`, which tracks the channel by **ID** instead of an emoji-prefixed name |
| 43 | `/ban`, `/kick`, `/mute` had no role-hierarchy check — a junior mod could act on an admin | `perms.canModerate()` enforced; bot's own permissions pre-checked; `/unban` validates the ID is a snowflake |
| 44 | `/gamble` commands had a double-spend race (read balance → check → write) | `store.spend()` deducts atomically and returns `ok`; items/payouts are granted only after |
| 45 | 513-line monolithic `interactionCreate.js` | Split into 15 named handlers with a single guarded router |

---

## 🔵 LOW / hygiene — fixed

| Item | Before | After |
|---|---|---|
| `README.md` | missing | full setup, intents, permissions, command tables, architecture, operations, security notes |
| `LICENSE` | missing | MIT |
| `.gitignore` | missing — `.env` and runtime data were committable | secrets, `data/`, temp and quarantine files excluded |
| `package-lock.json` | missing | committed (151 packages) |
| `.env.example` | missing | every variable, annotated, with the previous hardcoded values as defaults |
| Linter | none | eslint config + `npm run lint` → **0 problems** |
| CI-style checks | none | `npm run check` → `scripts/validate.js`, 8 classes of regression detection |
| Dead code | `antispam.js`, `twitchChecker.js` (contained `client.login('YOUR_DISCORD_BOT_TOKEN')`), `report.js` `handleInteraction` | removed |
| Unused deps | `@discordjs/voice`, `translate-google-api` | removed |
| Mixed-language comments | Hinglish + Italian inconsistently | normalised to English with rationale |
| Filename/command mismatch | `gtaslideshow.js` → `gta-slideshow` | renamed (validator warns on future mismatches) |
| Graceful shutdown | none | SIGINT/SIGTERM handlers destroy the client and clear all intervals |
| Boot diagnostics | silent | validates env, reports loaded command/handler counts, warns on duplicate handlers |

---

## 🔁 Round 2 — re-audit of the fixed tree

The first pass rewrote ~40 files by hand and patched the rest with automated codemods.
This section is a second audit that **re-read the codemod-only files line by line**, on
the assumption that a machine patch is exactly where a defect survives. It found 9 more,
including three that the first pass introduced itself.

### 12.1 ⭐ The three themed shops could all be double-spent

`minimarket.js`, `mobileshop.js` and `simshop.js` each open-coded the same shape:

```js
const coinsData = getCoinsData();      // balance read ONCE, at the top
if (userCoins < item.price) reject;    // checked against that stale snapshot
...                                    // several awaits
coinsData[userId] -= item.price;       // deducted much later, never re-checked
await saveCoinsData(coinsData);
```

`simshop.js` was the worst case — the check ran *before* a 60-second
`awaitModalSubmit`, and the deduction ran *after* it. During that whole minute the
purchase had already been approved, so the same coins could be spent on `/slots`,
`/coinflip` or a second shop. Two SIM purchases started together both passed the one
check and both deducted — a textbook lost update, and the balance could go negative.

**Fixed** in `lib/purchase.js`: every purchase is *deduct atomically → deliver → refund
on failure*. `store.spend()` re-checks affordability at deduction time inside the
serialised mutation, so the earlier check is only a fast-fail hint. Regression-tested
with 10 concurrent purchases on a 1,000-coin balance (all 10 succeed, balance lands on
exactly 0) and with a spend-elsewhere-during-the-window case (refused, never negative).

### 12.2 A failed delivery either gave the item away free or ate the coins

`mobileshop.js` added the role **first** and saved afterwards, so a failed save handed
out the role for nothing. `minimarket.js` did the opposite — it deducted, then only
*saved* if `roles.add()` succeeded, so the two shops disagreed about whether a failed
purchase refunded you. Neither recorded what was bought, so `/inventory` never showed
anything from these shops.

**Fixed:** delivery happens only after the coins are safely taken; any delivery failure
refunds in full; items are written to the inventory map.

### 12.3 Purchasable roles were matched by name with no hierarchy or privilege check

`VIP`, `Master Hacker`, `Network Guru`, `Cyber Operator` were resolved with
`roles.cache.find(r => r.name === ...)`. Anyone holding Manage Roles could create a
decoy role with one of those names and sell it for coins — and a role sitting above the
bot's highest role always failed *after* payment had been taken.

**Fixed** in `resolvePurchasableRole()`: refuses roles at or above the bot's highest
role, refuses any role holding `Administrator`, `ManageRoles`, `ManageChannels`,
`ManageGuild`, `BanMembers`, `KickMembers`, `ModerateMembers` or `ManageWebhooks`, and
is checked **before** the deduction so nothing is taken for a role that cannot be
granted. A coin shop is not an escalation path.

### 12.4 Cashback was uncapped — a purchase could be net-positive

The scratch card, the mystery box, phone cashback and the Iliad SIM deal all rolled a
random bonus with no ceiling. The Iliad deal paid up to **299 coins back on a 250-coin
SIM**, i.e. guaranteed profit on every purchase, which combined with 12.1 into an
infinite coin faucet.

**Fixed** in `applyBonus()`: every payout is clamped to at most the price paid
(`capRatio`), and an explicit cap of `0` now genuinely pays nothing — the first
implementation used `Number(cap) || hi`, which turned `0` into "uncapped".

### 12.5 `/jackpot` and `/coinparty` — unbounded inputs, un-awaited payout, bots could win

| Defect | Consequence |
|---|---|
| No bounds on `min_coins` / `max_coins` / `duration` | Negative ranges, a 10¹⁵-coin prize, or a duration of 10⁹ minutes — which overflows Node's int32 timer and ends the event instantly |
| `addJackpotCoins(winnerId, prize)` **not awaited** | The winner was told the coins were added even when the write failed |
| No `user.bot` check | A bot account could take the pool |
| Entrants who left the server could still be drawn | Coins paid to an account nobody could claim |
| Embed re-edited on **every** join | Discord rate limit once a few dozen people join quickly |
| No cap on concurrent events | Repeated launches flood the channel and leak collectors |
| Nothing persisted | A restart silently abandoned every entrant |

**Fixed** in `lib/prizeEvent.js` — one shared engine, so a fix to the prize logic can no
longer be applied to one command and missed in the other. Bounds are enforced both in
the command options (`setMinValue`/`setMaxValue`) and again at runtime, the payout is
awaited and the announcement says plainly when it failed, bots and departed members are
excluded from the draw, footer edits are coalesced on a 2-second throttle, at most 3
events run per guild, and entrants are persisted.

### 12.6 `/poll` announced success before it knew whether the poll existed

The command replied *"Creating your poll..."* publicly, then called `channel.send()`
with no permission pre-check and no `try/catch`. In a locked channel the send threw, the
rejection escaped to the global handler, and the moderator kept a success message for a
poll that never appeared. The duration was hardcoded to 24 hours, and `question`,
`option1` and `option2` had no length limits — so anything over Discord's 300/55
character caps was rejected by the API with an opaque `50035` *after* the confirmation
had been sent.

**Fixed:** `SendMessages` is pre-checked, everything is validated before the reply, the
send is wrapped, the confirmation is ephemeral and edited in place with the message
link, `duration` is configurable (1–168 h), and native polls can now take up to ten
answers instead of exactly two.

### 12.7 ⭐ A duplicate `/poll` command was silently discarded (introduced by pass 1)

The first pass added `commands/utility/poll.js` — a second, reaction-based poll that was
**never in the upstream repo**. It collided with the real `commands/poll.js`, and the
loader's duplicate-name guard dropped it with only a console warning. The result was the
worst of both: the file took up a slot, the boot log looked clean enough to miss, and
the *actual* `/poll` stayed broken with all of 12.6 unfixed.

**Fixed:** the duplicate is deleted, and the real `commands/poll.js` is fixed properly.
A new silent-drop audit (duplicate command names, malformed event files, dead lib
modules, Discord option limits) now runs over the whole tree and reports clean.

### 12.8 ⭐ `GuildMessageReactions` was in a comment, not in the client (upstream)

Upstream `index.js` listed the intent only inside a code comment — it was never passed
to the `Client`. So `messageReactionAdd` could never fire, and **every reaction handler
in the repository was dead code**. The first pass wrote a poll reaction guard that
inherited this: it could not possibly have run.

**Fixed:** the intent is now actually requested, `Partials.Message/Channel/Reaction` are
enabled so reactions added while the bot was offline arrive with an emoji name, and the
guard lives in `events/pollReactions.js` where the loader picks it up. This adds a
**deployment requirement** — enable *Message Reaction Intent* in the developer portal or
the gateway rejects the session (documented in `README.md` and `.env.example`).

### 12.9 ⭐ `/syndicate` read `state[undefined]`, and the giveaway's 30-day cap never worked

Four defects in one file plus one in the giveaway path:

- `loadSyndicateData()` was called with **no argument** in two places. The shim returned
  `{ undefined: {...} }`, so every `currentData[userId]` read was `undefined`: the Chats
  tab always showed *"No active chat nodes found"* no matter how many messages you had,
  and `currentData[userId].currentPage` threw a `TypeError` on the Contacts tab. The
  collector's async wrapper swallowed it, so users just saw Discord's *"This interaction
  failed"*.
- The compose modal was awaited **inside** the button collector with `time: 300_000`. An
  open modal blocked every other button on the app for up to five minutes, and
  cancelling it rejected the promise — caught only by a `console.log`.
- The modal's `customId` embedded `Date.now()`, so two rapid presses left two modals in
  flight and either could be matched by the wrong filter.
- Sending a message was a read-modify-write across two users with no serialisation, so
  two messages sent quickly could lose one.

And in the giveaway path: **the 30-day maximum added by pass 1 was never achievable.**
`30 * 86_400_000 = 2_592_000_000 ms` exceeds Node's int32 timer limit
(`2^31 - 1 = 2_147_483_647`). Both the giveaway and its join button are closed by a
timer built on that value, and Node fires an out-of-range timeout **immediately** with a
`TimeoutOverflowWarning` — so a "30 day" giveaway ended the instant it was created and
picked a winner from zero entrants. The ceiling is now 21 days, the largest round value
a single timer can actually schedule, and the form label and the rejection message are
both generated from the shared constant so they cannot drift again.

The duration parser also existed twice (`parseDuration` exported from `giveaway.js`,
which nothing ever called, and `parseGiveawayDuration` inside `interactionCreate.js`)
with the same broken cap hardcoded in both. It is now single-sourced in
`lib/duration.js`.

### 12.10 ⭐ `lib/data.js` could crash the whole bot, or wipe it (introduced by pass 1)

Two defects in the shared data layer, both found only because the second pass wrote
tests against malformed input:

- **Crash.** `migrateLegacy()` did `data.meta.migratedAt = ...` and
  `data.syndicate.legacy = ...` on whatever shape was on disk. A `store.json` missing
  `meta` — written by an older schema, partially restored from a backup, or hand-edited —
  threw `TypeError: Cannot set properties of undefined (setting 'migratedAt')`. Because
  `read()` runs the migration on **every** access, that broke the entire bot, not just
  one command. There is now a `normaliseShape()` pass guaranteeing `users`, `guilds`,
  `twitch`, `syndicate` and `meta` always exist, and `normaliseUser()` repairs user
  records that predate a field (`wallet: "90"` → `90`, `level: 0` → `1`, `inventory:
  null` → `{}`). Tested against seven malformed file shapes, including one that is not
  JSON at all and one that is an array.
- **Total data loss.** `updateGuild`, `updateTwitch`, `updateSyndicate` and `updateUser`
  all treated the callback's return value as the **entire document**. So
  `updateGuild(id, g => ({ ...g, antiLink: false }))` — the natural way to write it —
  replaced the whole store with one guild's settings and deleted every user, wallet,
  warning and level. Callbacks now merge into their own slot and the functions return
  the document. `updateSyndicateApp` likewise replaces the `app` object no longer; it
  merges, so a caller returning only `{ chats }` cannot wipe `currentPage`.
- `getGuild()` called `store.write()` on a **read path**, outside the mutation lock, so
  it could interleave with a concurrent `mutate()` and lose that write. It no longer
  persists; `updateGuild()` does.

### 12.11 ⭐ The `.gitignore` data rule was inert, so `data/` never reached a fresh clone

`.gitignore` said:

```
data/
!data/.gitkeep
```

Git **never descends into an excluded directory**, so that negation could not possibly
re-include anything — `data/.gitkeep` was never committable and never committed. A fresh
clone therefore had no `data/` folder at all, contradicting both the README and this
report's own claim that the placeholder was shipped. (The bot survives it anyway, because
`lib/store.js` calls `mkdirSync(..., {recursive: true})` before writing — which is why no
test caught it.)

**Fixed:** the rule is now `data/*`, the placeholder is committed, and there is a
regression test that fails if the inert form ever comes back.

While re-checking packaging: `npm test` did not exist even though this report told people
to run it, and the harness wrote to the *real* `data/store.json`. Both are fixed —
`npm test` and `npm run gate` are now wired up, and the harness **refuses to start** if
`data/store.json` already contains user data, because several of its assertions overwrite
that file with corrupt shapes on purpose.

---

## 🎵 Section 13 — new functionality

### 13.1 Music (`/music`, 13 subcommands)

Upstream declared `@discordjs/voice` in `package.json` and created
`client.musicQueues = new Map()` in `index.js` — and that was the entire feature. No
command, no player, nothing ever read the Map.

**What exists now:** `lib/music.js` (the engine) plus `commands/music.js` (the surface).

`play` · `queue` · `nowplaying` · `pause` · `resume` · `skip` · `stop` · `disconnect` ·
`volume` · `loop` · `shuffle` · `remove` · `clear`

YouTube search, single video links and playlist links (first 50 entries) through
`play-dl`, streamed via `@discordjs/voice`. The now-playing embed carries
pause/skip/stop buttons.

**The limits are the feature.** Every one of these is configurable in `.env` and clamped
in `lib/config.js`, because each absence is a specific way to break a server:

| Guard | Why |
|---|---|
| Per-track length cap (90 min) | A 10-hour loop video locks the queue for a day |
| Queue cap (200) | An unbounded queue is a memory leak |
| Playlist expansion cap (50) | One link must not be able to enqueue 5,000 tracks |
| Live streams & premieres refused | Their duration is 0/undefined and the stream never ends |
| Per-member 3 s throttle on queueing | One person cannot flood the queue with searches |
| Auto-leave after 5 min with no listeners | The bot must not sit in a channel burning a slot |
| Auto-leave 2 min after the queue drains | Same |
| YouTube only | `play-dl` also does SoundCloud/Spotify; a wider source list is a wider attack surface for no requested benefit |
| Blocked-channel list | Some voice channels should never host music |

**Ownership rules.** The bot only ever joins the *requester's* channel, and transport
controls only work from inside the channel the player is in — checked for the slash
commands **and again** for the buttons, because a `customId` is user-supplied data and
anyone could otherwise scroll back to an old now-playing message and stop another room's
audio. Before joining it verifies `Connect`, `Speak` and that the channel is not full,
and names the missing permission instead of joining silently and making no sound.

**Failure handling.** A stream that will not start is skipped with a message in the
channel rather than killing the player; a voice disconnect distinguishes a channel move
from a real kick; a lost connection retries five times with backoff; `shutdown()` destroys
every queue first so no ghost voice connection outlives the process; and a 60 s sweep
collects queues whose guild went away. Nothing in the engine is allowed to throw into an
interaction.

**Dependencies, chosen so `npm install` cannot fail.** `ffmpeg-static` provides a
prebuilt FFmpeg (no system install). `@noble/ciphers` provides voice encryption in pure
JS. Opus is deliberately split: `@discordjs/opus` (native, fast) sits in
**`optionalDependencies`** so a host that blocks native builds still installs, with
`opusscript` (pure JS) as a hard dependency fallback. `MUSIC_ENABLED=false` disables the
whole feature — every subcommand then replies that music is off and the player is never
loaded. `/version` reports which parts of the stack actually resolved.

### 13.2 Automatic version-change announcement

Requirement: the token already lives on the host, so pushing an update and restarting
should tell the server the bot is back, ping `@everyone`, and say what changed.

**The trigger is a version change, not a boot.** `lib/version.js` compares
`package.json`'s `version` against the last announced version, which is persisted in
`data/store.json` and therefore survives restarts:

| Situation | Result |
|---|---|
| New version | Announce once, then record it so a restart cannot repeat it |
| Same version | Silent — console log only |
| First ever boot | Announces by default (`ANNOUNCE_ON_FIRST_BOOT=false` to record silently) |
| Rollback to an older version | Recorded silently, never announced as an "update" |
| A version already announced before | Not repeated |

Announcing on every boot is the obvious implementation and the wrong one: a crash-loop —
or a host that restarts on every deploy hook — would ping `@everyone` repeatedly, which
is exactly how a bot gets kicked from a server.

**Guards around `@everyone`,** the most abusable ping in Discord:

* An hourly cap (default 3). When the cap is hit the version is **not** recorded, so the
  announcement is delayed rather than lost.
* The bot checks it actually holds **Mention Everyone** in the target channel *and* on its
  role; if not, it drops the ping and still posts the message instead of sending a mention
  that silently notifies nobody.
* The ping goes in `content`, not the embed — a mention inside an embed renders as text and
  never notifies anyone.
* If `ANNOUNCE_CHANNEL_ID` is unusable it falls back to the guild's system channel, then the
  first text channel, and logs that it fell back.
* A failed send is **not** recorded, so the next boot retries.

The message quotes up to 8 bullets from the matching `CHANGELOG.md` entry, plus the
previous version, the build commit (when the deploy is a git checkout) and the uptime.

**Shipping an update is therefore:** add a `## [x.y.z]` section to `CHANGELOG.md`, set the
same `"version"` in `package.json`, deploy, restart.

### 13.3 `/version` and `/changelog`

`/version` reports the running version, build commit, session uptime, command count,
whether music and announcements are enabled, and the health of the voice stack — which is
the usual failure point for music and the first thing to check after a deploy.

`/changelog` renders `CHANGELOG.md` inside Discord: the recent releases, or one specific
version via `version:2.1.0`. It parses the same file the announcement quotes, so the two
can never disagree.

Both are public and guild-only.

### 13.4 The static validator now catches the class of bug §12 kept finding

Three of the §12 defects were *silent* — the code was wrong and nothing complained. Each
is now a build failure in `npm run check`:

* **Duplicate command names.** `index.js` de-duplicates by name and drops the later file
  with a console warning, so `commands/utility/poll.js` hid the fact that the real `/poll`
  was still broken (§12.7). The validator now errors, naming both files. Verified live:
  adding a deliberate duplicate `/poll` produces
  `registers command "poll", which commands/poll.js already registers — the loader silently drops this one`.
* **Discord registration limits.** Name pattern and 32-char cap, 100-char descriptions for
  the command *and* every option, 25 options, 25 choices, and the
  group → subcommand → options nesting depth. Exceeding any of these makes
  `PUT /applications/{id}/commands` reject the **whole batch** with a 400, so one bad
  command silently stops every other command from registering.
* **Unreachable exports.** The loader only ever calls `execute`; anything else a command
  module exports is dead code. This is what caught `giveaway.js`'s never-called
  `parseDuration` (§12.9).
* **Both dependency directions.** A declared-but-unused package was already reported; now
  so is a `require()`d-but-undeclared one — which is precisely how the original repo failed
  to boot on a fresh `npm install` (`axios`, `node-cron`). The check knows about packages
  that a dependency loads at runtime on our behalf (`@noble/ciphers`, `opusscript`,
  `@discordjs/opus`) and verifies they at least resolve.

The validator also gained a note in its header explaining that it strips comments before
pattern matching, so documentation which *mentions* a dangerous pattern is not flagged as
a live violation.

### 13.5 GitHub publishing material

The repository's *About* (description, website, topics) lives on GitHub, not in the repo,
so it cannot be committed. `README.md` now carries a **Publishing on GitHub** section with
the exact description and topic list, both as a web-UI table and as ready-to-run `curl`
calls against `PATCH /repos/{owner}/{repo}` and `PUT /repos/{owner}/{repo}/topics`.

Two deployment guides ship with the tree. **`DEPLOY.md`** has the exact `git` command
sequence for pushing the fixed tree (both as a fresh repo adopting the existing history
and as a patch against a clone), the GitHub *About* description and topic list as both a
web-UI table and ready-to-run `curl` calls, the host checklist, and the release ritual for
future updates. **`TERMUX.md`** is the same flow for pushing from a phone: Termux install,
`termux-setup-storage`, three GitHub auth routes (`gh` CLI, PAT, SSH key), transferring the
216 KB source bundle with integrity checks, and the Termux-specific traps.

Both guides were **executed end-to-end, not just written**: the bundle was extracted into a
clean directory, installed with `--ignore-scripts` (which is what Termux needs, because
`ffmpeg-static` publishes no Android build), passed all four gates, then pushed through
Route A to a bare remote with a real `.env` and a populated `data/store.json` sitting in the
working tree. Neither was committed — the safety greps in the guide caught nothing, the push
was a fast-forward (238 → 239 commits), and the remote clone was inspected afterwards.

The README itself was rewritten as a real front page: feature summary, quick start with
the safety note about `npm test`, the privileged-intent table, a per-category command
reference including all 13 `/music` subcommands, the architecture tree, a *Music on your
host* section explaining the FFmpeg/opus/encryption situation and the optional-native
dependency strategy, an *Update announcements* section with the guard table, and deployment
options. `package.json` gained a real `description` and `keywords`.

---

## 📁 New modules

```
lib/config.js        every ID, toggle and threshold — read from .env
lib/store.js         atomic JSON persistence (tmp + rename), per-file mutex, corruption quarantine
lib/data.js          unified user/guild/twitch store + legacy migration + economy/levels/warnings API
lib/perms.js         central command→permission map, runtime gates, role-hierarchy helper
lib/roles.js         role resolution by ID with name fallback; safe role creation
lib/invites.js       single shared invite cache with diffing and vanity fallback
lib/guildStats.js    member-counter voice channel, tracked by ID
lib/cooldowns.js     bounded timer-free cooldowns + sliding windows
lib/logger.js        secret redaction and embed-safe truncation
lib/twitchConfig.js  per-guild Twitch settings
lib/economy.js       single item / pickaxe / drop catalog
scripts/validate.js  static regression checks (npm run check)
events/antispamListener.js   the anti-spam enforcement that never existed
commands/promote.js          explicit, audited replacement for silent auto-promotion
```

**Added by the second pass (§12):**

```
lib/purchase.js      atomic buy: deduct -> deliver -> refund; safe purchasable-role resolution
lib/shopkit.js       shared storefront for minimarket / mobileshop / simshop
lib/prizeEvent.js    shared engine for /jackpot and /coinparty
lib/duration.js      one duration parser, int32-safe, used by giveaway + interaction handler
events/pollReactions.js      the poll reaction guard (upstream's was dead code)
scripts/test.js      the 274-assertion runtime harness, checked in as `npm test`
scripts/audit.js     silent-drop audit, checked in as `npm run audit`
```

**Added by the third pass (§13):**

```
lib/music.js         YouTube playback: queue, player, voice lifecycle and every limit
lib/version.js       the version-change announcement engine
commands/music.js    /music with 13 subcommands
commands/version.js  /version — running build, uptime, feature toggles, voice-stack health
commands/changelog.js /changelog — CHANGELOG.md rendered inside Discord
CHANGELOG.md         machine-read by lib/version.js and by /changelog
DEPLOY.md            exact push commands, GitHub About text, host checklist
TERMUX.md            the same flow for pushing from a phone (Termux)
```

**New runtime dependencies:** `@discordjs/voice`, `play-dl`, `ffmpeg-static`,
`@noble/ciphers`, `opusscript` — plus `@discordjs/opus` in `optionalDependencies` so a
host that cannot build native modules still installs. Run `npm install` after pulling.

**Deleted by the second pass:** `commands/utility/poll.js` — a duplicate poll command the
first pass invented; the loader silently discarded it while the real `/poll` stayed broken.
The four legacy JSON stores (`coins.json`, `economyStorage.json`, `syndicateStorage.json`,
`securityStorage.json`) were already deleted by the first pass after migration, along with
`lib/coins.js` — a flat-coins compatibility shim the first pass wrote for call sites that
were themselves rewritten in the same pass, so nothing ever imported it. It was caught by
the dead-module audit in §12.7 and removed rather than kept as decoration.

---

## ⚠️ Deliberately disabled defaults

These behaviours existed before and are now **off**, because they are destructive or
surprising. Each has an `.env` switch to restore it.

| Setting | Old behaviour | Why it is off |
|---|---|---|
| `AUTO_HELPER_ENABLED` | Granted a role to a hardcoded user on every boot | Privilege escalation if that account is compromised — use `/promote` |
| `MEDIA_EMBED_ENABLED` | Deleted members' messages containing media links, everywhere | Destroys user content, replies and reactions |
| `TRANSLATION_DELETE_ORIGINAL` | Deleted the author's message after translating | Same — plus it surprises users |
| `MEDIA_EMBED_DELETE_ORIGINAL` | (as above, for media) | Same |

`/setup` also now requires an explicit `confirm:true` after showing a preview, since it
rewrites channel permissions.

---

## 🚀 How to deploy

**Option A — use the fixed tree directly**

```bash
cd /home/user/fixed
cp .env.example .env      # fill in DISCORD_TOKEN + GUILD_ID
npm install
npm run check             # static validation, no token needed
npm test                  # 274 runtime assertions (refuses to run on live data)
npm start
```

**Option B — apply the patch to your own clone**

```bash
git clone https://github.com/pakyji/The-Syndicate-Discord-Bot-.git
cd The-Syndicate-Discord-Bot-
git apply --check /home/user/patches/the-syndicate-fixes-full.patch   # dry run
git apply /home/user/patches/the-syndicate-fixes-full.patch
npm install
cp .env.example .env
npm run check && npm start
```

**Before going live:**
1. In the developer portal enable **all three** privileged intents — *Server Members*,
   *Message Content*, and (new in round 2) **Message Reaction**. If any is off, Discord
   rejects the gateway session with `UsedDisallowedIntents` and the bot exits. If you do
   not want the reaction intent, delete `events/pollReactions.js` and remove the
   `GuildMessageReactions` line from `index.js`; nothing else needs it.
2. Set `VERIFIED_ROLE_ID` and `HELPER_ROLE_ID` in `.env` — without them the bot falls
   back to matching roles by *name*, which is spoofable by anyone with Manage Roles. The
   same applies to any role sold by the themed shops.
3. Put the bot's own role **above** every role the shops sell (`VIP`, `Master Hacker`,
   `Network Guru`, `Cyber Operator`, …). A role at or above the bot's highest role is
   refused *before* payment, so no one loses coins — but the item will be unbuyable.
4. Set `GUILD_ID` so commands register instantly instead of taking up to an hour.
5. Put `LOG_CHANNEL_ID` on a **private** staff channel — error reports land there.
6. Review the disabled defaults above and re-enable only what you actually want.
7. Run `npm run gate` (lint + static validator + the 274 runtime assertions; no token
   needed). The test suite exercises the real data layer, so it **refuses to start** if
   `data/store.json` already holds user data — move it aside first if you want to re-run
   it on a live deployment.
8. Run the bot under a supervisor (`pm2`, `systemd`, Docker) with auto-restart — it
   deliberately `exit(1)`s on an uncaught exception rather than continuing corrupted.
9. **Music:** the bot needs **Connect** and **Speak** in the voice channels it should
   play in. `/music` refuses to join and names the missing permission rather than
   sitting silent. Run `npm install` after pulling — the voice stack adds
   `@discordjs/voice`, `play-dl`, `ffmpeg-static`, `@noble/ciphers`, `opusscript` and
   optionally `@discordjs/opus`. Set `MUSIC_ENABLED=false` to switch the feature off.
10. **Announcements:** for the `@everyone` ping to actually notify, the bot's role needs
    **Mention Everyone** in `ANNOUNCE_CHANNEL_ID`. Without it the message is still
    posted, just without the ping. Set `ANNOUNCE_CHANNEL_ID` explicitly — the default
    falls back to `HELPER_CHANNEL_ID`.

Legacy data (`coins.json`, `economyStorage.json`, `syndicateStorage.json`,
`securityStorage.json`) is migrated automatically into `data/store.json` on first boot,
then can be deleted.
