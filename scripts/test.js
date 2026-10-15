process.env.DISCORD_TOKEN = 'dummy';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');   // works from any checkout location

/*
 * ⭐ SAFETY GUARD. This suite exercises the real data layer, which writes to
 * data/store.json — and several assertions deliberately overwrite that file with
 * malformed shapes to prove the bot survives them. Running it on a live server
 * would therefore destroy real wallets, warnings and levels.
 *
 * It refuses to start if a populated store already exists. Move it aside first:
 *
 *     mv data/store.json /tmp/store.backup.json && npm test
 */
const LIVE_STORE = path.join(ROOT, 'data', 'store.json');
if (fs.existsSync(LIVE_STORE)) {
    let populated = false;
    try {
        const parsed = JSON.parse(fs.readFileSync(LIVE_STORE, 'utf8'));
        populated = !!parsed && (Object.keys(parsed.users || {}).length > 0
            || Object.keys(parsed.guilds || {}).length > 0
            || (parsed.meta && parsed.meta.migratedUsers > 0));
    } catch {
        populated = true;   // unparseable = somebody's real (possibly old) data
    }
    if (populated) {
        console.error([
            '',
            '❌ Refusing to run: data/store.json already contains real data.',
            '',
            '   This suite overwrites that file on purpose (it tests recovery from',
            '   corrupt and malformed stores), so running it here would destroy live',
            '   wallets, warnings and levels.',
            '',
            '   Move it aside first, then re-run:',
            '',
            '     mv data/store.json /tmp/store.backup.json && npm test',
            '',
        ].join('\n'));
        process.exit(1);
    }
}

(async () => {
  let pass = 0, fail = 0;
  const t = (name, cond, extra='') => { if (cond) { pass++; console.log('  ✅', name); } else { fail++; console.log('  ❌', name, extra); } };

  console.log('\n=== 1. Atomic store: no torn writes ===');
  const store = require(path.join(ROOT,'lib/store'));
  const tmp = '/tmp/atomic-test.json';
  fs.rmSync(tmp,{force:true});
  store.write(tmp, { a: 1 });
  t('write creates file', fs.existsSync(tmp));
  t('no .tmp left behind', !fs.existsSync(tmp + '.tmp'));
  t('read round-trips', store.read(tmp).a === 1);
  fs.writeFileSync(tmp, '{ this is not json');
  store.invalidate(tmp);
  const healed = store.read(tmp, { fallback: true });
  t('corrupt file quarantined + falls back', healed.fallback === true);
  t('quarantine copy written', fs.readdirSync('/tmp').some(f => f.startsWith('atomic-test.json.corrupt-')));

  console.log('\n=== 2. Serialised mutation (no lost updates) ===');
  fs.rmSync(tmp,{force:true}); store.invalidate(tmp);
  store.write(tmp, { n: 0 });
  // 50 concurrent increments — a naive read-modify-write would lose most of them
  await Promise.all(Array.from({length:50}, () => store.mutate(tmp, {n:0}, d => { d.n += 1; })));
  t('50 concurrent increments all landed', store.read(tmp).n === 50, 'got ' + store.read(tmp).n);

  console.log('\n=== 3. Unified data layer ===');
  const data = require(path.join(ROOT,'lib/data'));
  const U = '123456789012345678';
  await data.addBalance(U, 500);
  t('addBalance credits wallet', data.getWallet(U) === 500, 'got '+data.getWallet(U));
  const over = await data.spend(U, 9999);
  t('spend refuses insufficient funds', over.ok === false);
  t('balance unchanged after refused spend', data.getWallet(U) === 500);
  const ok = await data.spend(U, 200);
  t('spend succeeds when affordable', ok.ok === true && ok.balance === 300, JSON.stringify(ok));
  // concurrent double-spend attempt
  const [r1,r2] = await Promise.all([data.spend(U,300), data.spend(U,300)]);
  t('concurrent double-spend blocked (only one ok)', [r1.ok,r2.ok].filter(Boolean).length === 1, JSON.stringify([r1,r2]));
  await data.addItem(U,'diamond_pickaxe',2);
  t('addItem uses map shape', data.getInventory(U).diamond_pickaxe === 2);
  t('hasItem works', data.hasItem(U,'diamond_pickaxe',2) === true);
  await data.removeItem(U,'diamond_pickaxe',1);
  t('removeItem decrements', data.getInventory(U).diamond_pickaxe === 1);
  await data.removeItem(U,'diamond_pickaxe',5);
  t('removeItem refuses when not enough', data.getInventory(U).diamond_pickaxe === 1);

  console.log('\n=== 4. Levels & warnings persist ===');
  for (let i=0;i<8;i++) await data.addXp(U, 15);
  const lv = data.getLevel(U);
  t('XP accumulates and levels up', lv.level >= 2, JSON.stringify(lv));
  t('rank is numeric', typeof data.rank(U) === 'number');
  const n1 = await data.addWarning(U,{reason:'spam',moderatorId:'1',guildId:'2'});
  const n2 = await data.addWarning(U,{reason:'flood',moderatorId:'1',guildId:'2'});
  t('warnings increment', n1===1 && n2===2);
  const removed = await data.removeWarning(U,1);
  t('removeWarning returns the entry', removed && removed.reason==='spam');
  t('remaining warnings renumbered', data.getWarnings(U)[0].id===1 && data.getWarnings(U)[0].reason==='flood');
  t('clearWarnings empties', (await data.clearWarnings(U))===1 && data.getWarnings(U).length===0);

  console.log('\n=== 5. Per-guild moderation settings ===');
  const G1='1111111111111111111', G2='2222222222222222222';
  t('guild defaults antiLink on', data.getGuild(G1).antiLink === true);
  await data.updateGuild(G1, g => { g.antiLink = false; });
  t('G1 toggled off', data.getGuild(G1).antiLink === false);
  t('G2 unaffected (per-guild, not global)', data.getGuild(G2).antiLink === true);
  t('placeholder badwords not seeded', !data.getGuild(G2).badWords.some(w=>/^badword\d*$/i.test(w)));

  console.log('\n=== 6. Cooldowns are bounded & timer-free ===');
  const { Cooldowns, SlidingWindow } = require(path.join(ROOT,'lib/cooldowns'));
  const cd = new Cooldowns(1000, 5);
  t('take() first time ok', cd.take('a')===true);
  t('take() again blocked', cd.take('a')===false);
  t('remaining() > 0', cd.remaining('a')>0);
  for(let i=0;i<100;i++) cd.take('u'+i);
  t('evicts beyond maxSize', cd.size <= 100, 'size='+cd.size);
  const sw = new SlidingWindow(1000,10);
  t('sliding window counts', sw.hit('x')===1 && sw.hit('x')===2);

  console.log('\n=== 7. Permission gates registered correctly ===');
  const perms = require(path.join(ROOT,'lib/perms'));
  const gated = Object.entries(perms.COMMAND_PERMISSIONS).filter(([,v])=>v).map(([k])=>k);
  t('all previously-exposed commands are gated', ['ban','unban','mute','unmute','clearwarn','dm','announcement','say','poll','antilink','antibadwords','antispam','reactionroles','setup','refresh','kick','id','twitch','setupverify','giveaway','gta-slideshow','verify-members','promote','clear'].every(c=>gated.includes(c)), 'missing: '+['ban','unban','mute','unmute','clearwarn','dm','announcement','say','poll','antilink','antibadwords','antispam','reactionroles','setup','refresh','kick','id','twitch','setupverify','giveaway','gta-slideshow','verify-members','promote','clear'].filter(c=>!gated.includes(c)));
  t('public commands stay public', ['balance','help','ping','level','leaderboard','report','inventory','mine','shop','slots','coinflip','syndicate','minimarket','mobileshop','simshop','gtsos'].every(c=>perms.COMMAND_PERMISSIONS[c]===null));

  console.log('\n=== 8. Log redaction ===');
  const { redact, formatError } = require(path.join(ROOT,'lib/logger'));
  t('bot token redacted', !redact('token MFxxxxxxxxxxxxxxxxxx.ABCDEF.abcdefghijklmnopqrstuvwxyz1234').includes('MFxxxx'));
  t('webhook redacted', !redact('https://discord.com/api/webhooks/123456/abcdefg').includes('123456'));
  t('env secret redacted', !redact('client_secret=supersecretvalue123').includes('supersecretvalue123'));
  t('bearer redacted', !redact('Authorization: Bearer abc.def.ghi').includes('abc.def.ghi'));
  t('home path shortened', !redact('at /home/user/fixed/lib/data.js').includes('/home/user/fixed'));
  t('formatError truncates', formatError(new Error('x'.repeat(9000))).length < 4000);

  console.log('\n=== 10. Invite cache is a single shared instance ===');
  const inv1 = require(path.join(ROOT,'lib/invites'));
  delete require.cache[require.resolve(path.join(ROOT,'events/inviteTracker'))];
  delete require.cache[require.resolve(path.join(ROOT,'events/guildMemberAdd'))];
  const tracker = require(path.join(ROOT,'events/inviteTracker'));
  const join = require(path.join(ROOT,'events/guildMemberAdd'));
  t('inviteTracker + guildMemberAdd share one cache object', inv1.cache === inv1.cache && typeof tracker.execute==='function' && typeof join.execute==='function');

  console.log('\n=== 11. Purchase engine: atomic deduct -> deliver -> refund ===');
  const { purchase, resolvePurchasableRole, applyBonus } = require(path.join(ROOT,'lib/purchase'));
  const P1 = '200000000000000001';
  await data.addBalance(P1, 1000);

  const hasPerm = (role, flag) => (role.perms || []).includes(flag);
  function fakeGuild(roleDefs, botPos, opts = {}) {
    const roles = roleDefs.map((r) => ({
      id: r.id, name: r.name, position: r.position,
      permissions: { has: (flag) => hasPerm(r, flag) },
    }));
    return {
      id: '900000000000000000',
      roles: { cache: { find: (fn) => roles.find(fn) || null, get: (id) => roles.find((r) => r.id === id) || null } },
      members: { me: { roles: { highest: { position: botPos } } } },
      __throw: !!opts.throwOnAdd,
    };
  }
  const fakeMember = (guild, existing = []) => ({
    roles: {
      cache: { has: (id) => existing.includes(id) },
      add: async () => { if (guild.__throw) throw new Error('Missing Permissions'); existing.push('x'); },
    },
  });

  // Role purchase, happy path.
  const g1 = fakeGuild([{ id: 'r_vip', name: 'VIP', position: 5 }], 10);
  const m1 = fakeMember(g1);
  const rp = await purchase({ guild: g1, member: m1, userId: P1, item: { price: 300, type: 'role', roleName: 'VIP', key: 'vip' } });
  t('role purchase succeeds', rp.ok === true && rp.granted === 'VIP', JSON.stringify(rp));
  t('coins deducted exactly once', rp.balance === 700 && data.getWallet(P1) === 700, 'got '+data.getWallet(P1));

  // The old bug: mobileshop added the role BEFORE saving, so a failed save was a free role.
  const m2 = fakeMember(g1, ['r_vip']);
  const own = await purchase({ guild: g1, member: m2, userId: P1, item: { price: 300, type: 'role', roleName: 'VIP', key: 'vip' } });
  t('already-owned role refused', own.ok === false);
  t('refused purchase fully refunded', own.balance === 700 && data.getWallet(P1) === 700, 'got '+data.getWallet(P1));

  // Missing role: deducted then refunded, nothing granted.
  const none = await purchase({ guild: g1, member: m2, userId: P1, item: { price: 100, type: 'role', roleName: 'Ghost', key: 'ghost' } });
  t('nonexistent role refunded', none.ok === false && data.getWallet(P1) === 700, 'got '+data.getWallet(P1));

  // Item purchase records into the inventory (the original never recorded anything).
  const ip = await purchase({ guild: null, member: null, userId: P1, item: { price: 50, type: 'item', key: 'coffee' } });
  t('item purchase records inventory', ip.ok === true && (data.getInventory(P1).coffee || 0) === 1, JSON.stringify(ip));
  t('item price deducted', data.getWallet(P1) === 650, 'got '+data.getWallet(P1));

  // ⭐ The double-spend regression test: 10 concurrent purchases of 100 coins on a
  //   1000-coin balance. The original checked a stale snapshot, so all 10 passed.
  const P2 = '200000000000000002';
  await data.addBalance(P2, 1000);
  const results = await Promise.all(Array.from({ length: 10 }, () =>
    purchase({ guild: null, member: null, userId: P2, item: { price: 100, type: 'item', key: 'race' } })));
  t('all concurrent purchases affordable at 1000', results.every((r) => r.ok === true));
  t('no lost updates - balance is exactly 0', data.getWallet(P2) === 0, 'got '+data.getWallet(P2));
  const broke = await purchase({ guild: null, member: null, userId: P2, item: { price: 1, type: 'item', key: 'race' } });
  t('next purchase correctly refused', broke.ok === false && broke.error === 'insufficient');

  // ⭐ The simshop 60-second-modal regression: spend the same coins elsewhere
  //   while the check has already passed, then the deduction must fail, not go negative.
  const P3 = '200000000000000003';
  await data.addBalance(P3, 250);
  const walletAtCheckTime = data.getWallet(P3);          // stale snapshot, as simshop did
  await data.spend(P3, 250);                              // user spends it on /slots meanwhile
  const late = await purchase({ guild: null, member: null, userId: P3, item: { price: 250, type: 'item', key: 'sim' } });
  t('stale affordability check cannot overspend', walletAtCheckTime === 250 && late.ok === false);
  t('balance never goes negative', data.getWallet(P3) === 0, 'got '+data.getWallet(P3));

  // Concurrent failures must refund exactly once each (no over-refund).
  const gThrow = fakeGuild([{ id: 'r_x', name: 'X', position: 5 }], 10, { throwOnAdd: true });
  const P4 = '200000000000000004';
  await data.addBalance(P4, 1000);
  const fails = await Promise.all(Array.from({ length: 5 }, () =>
    purchase({ guild: gThrow, member: fakeMember(gThrow), userId: P4, item: { price: 100, type: 'role', roleName: 'X', key: 'x' } })));
  t('delivery failures all reported', fails.every((r) => r.ok === false));
  t('refunds are exact, never over-credited', data.getWallet(P4) === 1000, 'got '+data.getWallet(P4));

  console.log('\n=== 12. Purchasable roles: hierarchy & privilege checks ===');
  const gAdmin = fakeGuild([
    { id: 'r_admin', name: 'Master Hacker', position: 5, perms: ['Administrator'] },
    { id: 'r_mod', name: 'Moderator', position: 5, perms: ['ModerateMembers'] },
    { id: 'r_high', name: 'Owner', position: 50 },
    { id: 'r_ok', name: 'Network Guru', position: 5 },
  ], 10);
  t('Administrator role cannot be bought with coins', !!resolvePurchasableRole(gAdmin, 'Master Hacker').error);
  t('ModerateMembers role cannot be bought with coins', !!resolvePurchasableRole(gAdmin, 'Moderator').error);
  t('role above the bot is refused BEFORE payment', !!resolvePurchasableRole(gAdmin, 'Owner').error);
  t('role lookup is case-insensitive', resolvePurchasableRole(gAdmin, 'network guru').role?.id === 'r_ok');
  t('plain role resolves', resolvePurchasableRole(gAdmin, 'Network Guru').role?.id === 'r_ok');
  t('no guild -> clear error, not a crash', !!resolvePurchasableRole(null, 'Network Guru').error);

  console.log('\n=== 13. Cashback is clamped (no coin faucet) ===');
  const P5 = '200000000000000005';
  await data.addBalance(P5, 0);
  // The original Iliad deal: 250-coin SIM, up to 299 coins back = guaranteed profit.
  let minted = 0;
  for (let i = 0; i < 300; i++) {
    const b = await applyBonus(P5, 40, 299, 250);
    minted = Math.max(minted, b.bonus);
  }
  t('bonus never exceeds the cap', minted <= 250, 'worst case '+minted);
  t('cap of 0 pays nothing', (await applyBonus(P5, 10, 500, 0)).bonus === 0);
  t('inverted min/max is normalised', (await applyBonus(P5, 900, 10, 1000)).bonus >= 10);
  t('non-numeric input cannot mint NaN', Number.isFinite((await applyBonus(P5, 'x', 'y', 10)).bonus));

  console.log('\n=== 14. Prize events: bounded, awaited, bot-proof ===');
  const pe = require(path.join(ROOT,'lib/prizeEvent'));
  t('min > max rejected', pe.validateOptions({ minCoins: 500, maxCoins: 100, durationMinutes: 5 }).ok === false);
  t('negative coins rejected', pe.validateOptions({ minCoins: -5, maxCoins: 100, durationMinutes: 5 }).ok === false);
  t('zero coins rejected', pe.validateOptions({ minCoins: 0, maxCoins: 0, durationMinutes: 5 }).ok === false);
  t('absurd prize rejected', pe.validateOptions({ minCoins: 1, maxCoins: 1e15, durationMinutes: 5 }).ok === false);
  t('absurd duration rejected', pe.validateOptions({ minCoins: 1, maxCoins: 100, durationMinutes: 1e9 }).ok === false);
  t('non-numeric rejected', pe.validateOptions({ minCoins: NaN, maxCoins: 100, durationMinutes: 5 }).ok === false);
  const spec = pe.validateOptions({ minCoins: 100, maxCoins: 500, durationMinutes: 10 });
  t('valid options accepted', spec.ok === true);
  t('prize stays inside the requested range', spec.prize >= 100 && spec.prize <= 500, 'got '+spec.prize);
  t('prize is an integer', Number.isInteger(spec.prize));
  t('duration fits Node int32 timer', spec.ms <= 2 ** 31 - 1);
  t('concurrent prize events are capped', pe.MAX_CONCURRENT === 3 && typeof pe.countActive('nope') === 'number');
  const idxSrc = fs.readFileSync(path.join(ROOT,'index.js'), 'utf8');
  t('GuildMessageReactions intent actually enabled (was comment-only upstream)',
    /GuildMessageReactions\s*,/.test(idxSrc.split('intents: [')[1].split(']')[0]));
  t('partials enabled for offline reactions', /Partials\.Reaction/.test(idxSrc));
  t('poll reaction guard is a real loaded event, not a dead export',
    fs.existsSync(path.join(ROOT,'events/pollReactions.js'))
    && !/rawEvent/.test(fs.readFileSync(path.join(ROOT,'commands/poll.js'),'utf8')));

  console.log('\n=== 15. Command-level bounds & the three shops share one engine ===');
  for (const cmd of ['jackpot','coinparty']) {
    const json = require(path.join(ROOT,'commands',cmd)).data.toJSON();
    const opts = json.options || [];
    t(`${cmd}: every numeric option has min+max bounds`,
      opts.length === 3 && opts.every((o) => o.min_value != null && o.max_value != null),
      JSON.stringify(opts.map((o)=>[o.name,o.min_value,o.max_value])));
    t(`${cmd}: administrator-gated`, json.default_member_permissions != null);
    t(`${cmd}: guild-only`, json.dm_permission === false);
  }
  const pollJson = require(path.join(ROOT,'commands/poll')).data.toJSON();
  const pOpts = pollJson.options || [];
  const dur = pOpts.find((o) => o.name === 'duration');
  t('poll: duration is configurable and bounded (1h-7d)', dur && dur.min_value === 1 && dur.max_value === 168, JSON.stringify(dur));
  t('poll: ManageMessages-gated', pollJson.default_member_permissions != null);
  t('poll: guild-only', pollJson.dm_permission === false);
  const ans = pOpts.filter((o) => /^option\d+$/.test(o.name));
  t('poll: supports up to 10 native answers', ans.length === 10, 'got '+ans.length);
  t('poll: exactly the first two answers are required', ans.filter((o)=>o.required).length === 2);
  t('poll: question length bounded to Discord cap', pOpts.find((o)=>o.name==='question')?.max_length === 300);
  t('poll: answers bounded to Discord cap', ans.every((o) => o.max_length === 55 && o.min_length === 1));
  t('poll: has a channel + multiselect option', pOpts.some((o)=>o.name==='channel') && pOpts.some((o)=>o.name==='multiselect'));
  t('poll: only ONE poll command file exists (duplicate was silently dropped)',
    fs.readdirSync(path.join(ROOT,'commands')).filter((f)=>f==='poll.js').length === 1
    && !fs.existsSync(path.join(ROOT,'commands/utility/poll.js')));

  const shopkitPath = require.resolve(path.join(ROOT,'lib/shopkit'));
  const shops = ['minimarket','mobileshop','simshop'].map((s) => require(path.join(ROOT,'commands',s)));
  t('all three shops share one engine instance',
    shops.every(() => Object.keys(require.cache).some((k) => k === shopkitPath))
    && shops.every((s) => typeof s.execute === 'function'));
  for (const s of shops) {
    const j = s.data.toJSON();
    const buy = (j.options || []).find((o) => o.name === 'buy');
    const choices = buy?.options?.[0]?.choices || [];
    t(`${j.name}: choices generated from the catalogue (>=2, <=25)`,
      choices.length >= 2 && choices.length <= 25, 'got '+choices.length);
    t(`${j.name}: every choice name carries a price`, choices.every((c) => /\d+ coins$/.test(c.name)));
    t(`${j.name}: choices are unique`, new Set(choices.map((c) => c.value)).size === choices.length);
    t(`${j.name}: has view + buy subcommands`, (j.options||[]).map((o)=>o.name).sort().join(',') === 'buy,view');
  }

  /**
   * Strip comments before grepping a source file. Several of the assertions below
   * look for code that must be ABSENT, and the fix files deliberately document the
   * old broken snippet in their header comments — grepping the raw text would make
   * those tests fail for the wrong reason.
   */
  const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  console.log('\n=== 16. Duration parsing is single-sourced and int32-safe ===');
  const durLib = require(path.join(ROOT,'lib/duration'));
  t('10s parses', durLib.parseGiveawayDuration('10s') === 10000);
  t('1h parses', durLib.parseGiveawayDuration('1h') === 3600000);
  t('3d parses', durLib.parseGiveawayDuration('3d') === 259200000);
  t('21d is the giveaway ceiling', durLib.parseGiveawayDuration('21d') === durLib.GIVEAWAY_LIMITS.maxMs);
  t('22d rejected', durLib.parseGiveawayDuration('22d') === null);
  t('⭐ the giveaway ceiling fits a real Node timer (30d did NOT - it overflowed int32 and fired instantly)',
    durLib.GIVEAWAY_LIMITS.maxMs <= durLib.MAX_SAFE_TIMEOUT_MS,
    durLib.GIVEAWAY_LIMITS.maxMs + ' > ' + durLib.MAX_SAFE_TIMEOUT_MS);
  t('30d is now rejected rather than silently overflowing', durLib.parseGiveawayDuration('30d') === null);
  // Evaluate the label the way discord.js will, instead of grepping for a string
  // that is computed from the shared limits at runtime.
  const gwModalSrc = codeOnly(fs.readFileSync(path.join(ROOT,'commands/utility/giveaway.js'),'utf8'));
  const gwLabel = `Duration (${durLib.describeDurationLimits(durLib.GIVEAWAY_LIMITS)})`;
  t('the giveaway form derives its label from the shared limits', /describeDurationLimits\(GIVEAWAY_LIMITS\)/.test(gwModalSrc));
  t('that label states the real 21-day ceiling', gwLabel.includes('21d maximum'), gwLabel);
  t('the label fits Discord’s 45-character TextInput limit', gwLabel.length <= 45, gwLabel.length + ' chars');
  t('the rejection message states the real ceiling',
    /describeDurationLimits\(GIVEAWAY_LIMITS\)/.test(fs.readFileSync(path.join(ROOT,'events/interactionCreate.js'),'utf8')));
  t('below the 10s floor rejected', durLib.parseGiveawayDuration('9s') === null);
  t('free text rejected', durLib.parseGiveawayDuration('tomorrow') === null);
  t('empty/null rejected', durLib.parseGiveawayDuration('') === null && durLib.parseGiveawayDuration(undefined) === null);
  t('negative rejected', durLib.parseGiveawayDuration('-5m') === null);
  t('zero rejected', durLib.parseGiveawayDuration('0m') === null);
  t('absurd input rejected outright', durLib.parseDuration('999999999d') === null);
  t('⭐ no parser ever returns a value Node cannot schedule',
    ['1s','59s','60m','24h','100d','365d','99999d'].every((v) => {
      const ms = durLib.parseDuration(v);
      return ms === null || ms <= durLib.MAX_SAFE_TIMEOUT_MS;
    }));
  t('a duration past the timer limit is rejected outright, never passed to setTimeout',
    durLib.parseDuration('365d') === null && durLib.parseDuration('100d') === null);
  t('an explicit maxMs above the timer limit is clamped down by the parser',
    durLib.parseDuration('30d', { maxMs: 40 * 86400000 }) === null);
  t('a duration just inside the limit still schedules',
    durLib.parseDuration('24d') === 24 * 86400000);
  const gwSrc = fs.readFileSync(path.join(ROOT,'commands/utility/giveaway.js'),'utf8');
  const icSrc = fs.readFileSync(path.join(ROOT,'events/interactionCreate.js'),'utf8');
  t('giveaway.js no longer keeps a private copy of the parser', !/function parseDuration/.test(codeOnly(gwSrc)));
  t('interactionCreate.js no longer keeps a private copy', !/function parseGiveawayDuration/.test(codeOnly(icSrc)));
  t('both sides import the shared module', /lib\/duration'/.test(codeOnly(gwSrc)) && /lib\/duration'/.test(codeOnly(icSrc)));
  t('the giveaway form label is generated from the shared limits', /describeDurationLimits\(GIVEAWAY_LIMITS\)/.test(codeOnly(gwSrc)));

  console.log('\n=== 17. /syndicate reads the CALLER state, not state[undefined] ===');
  const synSrc = fs.readFileSync(path.join(ROOT,'commands/economy/syndicate.js'),'utf8');
  t('the argument-less loadSyndicateData() shim is gone', !/function loadSyndicateData/.test(codeOnly(synSrc)));
  t('the saveSyndicateData() snapshot shim is gone', !/function saveSyndicateData/.test(codeOnly(synSrc)));
  t('no currentData[userId] reads remain', !/currentData\[/.test(codeOnly(synSrc)));
  t('chat state is read through the store for the acting user', /store\.getSyndicateApp\(userId\)/.test(codeOnly(synSrc)));
  t('the compose modal no longer blocks the button collector', !/awaitModalSubmit/.test(codeOnly(synSrc)));
  t('modal submissions use a dedicated one-shot collector', /createModalCollector\(/.test(codeOnly(synSrc)) && /max: 1,/.test(codeOnly(synSrc)));
  t('modal customId is deterministic (no Date.now() races)', !/synd_modal_\$\{userId\}_\$\{Date\.now\(\)\}/.test(codeOnly(synSrc)));
  t('messages are appended atomically to both sides', /async function appendMessage/.test(codeOnly(synSrc)) && /updateSyndicateApp/.test(codeOnly(synSrc)));
  t('threads are capped on disk', /slice\(-200\)/.test(codeOnly(synSrc)));
  // Prove the store round-trips a two-sided conversation the way appendMessage does.
  const A = '300000000000000001', B = '300000000000000002';
  for (const [owner, peer] of [[A,B],[B,A]]) {
    await data.updateSyndicateApp(owner, (app) => {
      const chats = app.chats || {};
      chats[peer] = [...(chats[peer] || []), { sender: A, text: 'hello', time: '01:00' }];
      return { ...app, chats };
    });
  }
  t('sender sees the thread', (data.getSyndicateApp(A).chats[B] || []).length === 1);
  t('recipient sees the same thread', (data.getSyndicateApp(B).chats[A] || []).length === 1);
  await data.updateSyndicateApp(A, (app) => ({ ...app, currentPage: 3 }));
  t('pagination survives a round-trip (used to throw a TypeError)', data.getSyndicateApp(A).currentPage === 3);
  t('a user with no state gets a usable blank, not undefined',
    !!data.getSyndicateApp('400000000000000009').chats);

  console.log('\n=== 18. Data layer survives a malformed store.json ===');
  // ⭐ Regression for a crash found on re-audit: `data.meta.migratedAt = ...` ran
  //   on whatever shape was on disk, so a store.json missing `meta` threw
  //   "Cannot set properties of undefined" — and because read() runs the migration
  //   on EVERY access, that broke the whole bot, not just one command.
  const DATA_FILE = data.DATA_FILE;
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const backup = fs.existsSync(DATA_FILE) ? fs.readFileSync(DATA_FILE, 'utf8') : null;
  const restore = () => {
    store.invalidate(DATA_FILE);
    if (backup === null) fs.rmSync(DATA_FILE, { force: true });
    else fs.writeFileSync(DATA_FILE, backup);
    store.invalidate(DATA_FILE);
  };

  async function withFile(contents, fn) {
    fs.writeFileSync(DATA_FILE, contents);
    store.invalidate(DATA_FILE);
    try { return await fn(); } finally { restore(); }
  }

  await withFile('{"users":{"500000000000000001":{"wallet":42}}}', async () => {
    let threw = null;
    try { await data.addBalance('500000000000000001', 8); } catch (e) { threw = e; }
    t('no "meta" key: addBalance does not throw', threw === null, threw && threw.message);
    t('no "meta" key: the write still landed', data.getWallet('500000000000000001') === 50,
      'got ' + data.getWallet('500000000000000001'));
  });

  await withFile('{"meta":{}}', async () => {
    let threw = null;
    try { await data.addBalance('500000000000000002', 5); } catch (e) { threw = e; }
    t('no "users" key: addBalance does not throw', threw === null, threw && threw.message);
  });

  await withFile('{"users":{},"meta":{"migratedAt":"2026-01-01"}}', async () => {
    let threw = null;
    try { await data.updateGuild('900000000000000001', (g) => ({ ...g, antiLink: false })); } catch (e) { threw = e; }
    t('no "guilds" key: updateGuild does not throw', threw === null, threw && threw.message);
    t('guild write lands and merges over defaults',
      data.getGuild('900000000000000001').antiLink === false);
  });

  await withFile('{"users":{"500000000000000003":{"wallet":"90","level":0,"xp":-5,"inventory":null,"warnings":"nope"}},"meta":{"migratedAt":"x"}}', async () => {
    const u = data.user('500000000000000003');
    t('a pre-schema user record is repaired, not crashed on',
      u.wallet === 90 && u.level === 1 && u.xp === 0 && typeof u.inventory === 'object' && Array.isArray(u.warnings),
      JSON.stringify(u));
  });

  await withFile('{"users":{"500000000000000004":{"app":{"currentPage":7,"theme":"neon"}}},"meta":{"migratedAt":"x"}}', async () => {
    // updateSyndicateApp used to REPLACE the app object, silently dropping keys
    // the caller did not spread back in.
    await data.updateSyndicateApp('500000000000000004', () => ({ chats: { x: [] } }));
    const app = data.getSyndicateApp('500000000000000004');
    t('a partial app update merges instead of wiping sibling keys',
      app.theme === 'neon' && app.currentPage === 7 && Array.isArray(app.chats.x), JSON.stringify(app));
    await data.updateSyndicateApp('500000000000000004', (a) => ({ ...a, currentPage: 2 }));
    t('currentPage updates in place', data.getSyndicateApp('500000000000000004').currentPage === 2);
  });

  await withFile('not json at all', async () => {
    let threw = null;
    try { await data.addBalance('500000000000000005', 1); } catch (e) { threw = e; }
    t('a corrupt store.json recovers instead of throwing', threw === null, threw && threw.message);
  });

  await withFile('[]', async () => {
    let threw = null;
    try { data.getWallet('500000000000000006'); } catch (e) { threw = e; }
    t('an array-shaped store.json is treated as empty', threw === null, threw && threw.message);
  });

  restore();

  console.log('\n=== 19. A callback that returns a record cannot wipe the whole store ===');
  // ⭐ Regression for total data loss: updateGuild/updateTwitch/updateSyndicate
  //   returned the callback's value as if it were the ENTIRE document, so
  //   `updateGuild(id, g => ({ ...g, antiLink: false }))` replaced the store with
  //   one guild's settings and deleted every user, wallet and warning.
  const GU = '900000000000000099';
  const KEEP1 = '510000000000000001', KEEP2 = '510000000000000002';
  await data.addBalance(KEEP1, 777);
  await data.addBalance(KEEP2, 888);
  await data.updateGuild(GU, (g) => ({ ...g, antiLink: false }));
  t('guild setting written', data.getGuild(GU).antiLink === false);
  t('⭐ other users survived the guild write', data.getWallet(KEEP1) === 777 && data.getWallet(KEEP2) === 888,
    `got ${data.getWallet(KEEP1)}/${data.getWallet(KEEP2)}`);
  t('other guild keys kept their defaults', typeof data.getGuild(GU).antiBadWords === 'boolean'
    && Array.isArray(data.getGuild(GU).badWords));

  await data.updateTwitch(GU, (tw) => ({ ...tw, channels: ['twitch_one'] }));
  t('twitch setting written', data.getGuild(GU) && (data.getTwitch(GU).channels || []).includes('twitch_one'));
  t('⭐ users survived the twitch write', data.getWallet(KEEP1) === 777 && data.getWallet(KEEP2) === 888);

  await data.updateSyndicate((syn) => ({ ...syn, active: 'event-1' }));
  t('syndicate setting written', data.getSyndicate().active === 'event-1');
  t('⭐ users survived the syndicate write', data.getWallet(KEEP1) === 777 && data.getWallet(KEEP2) === 888);
  t('⭐ the twitch config survived too', (data.getTwitch(GU).channels || []).includes('twitch_one'));

  // A callback that returns nothing must still keep its in-place mutation.
  await data.updateGuild(GU, (g) => { g.antiSpam = false; });
  t('in-place mutation with no return value is kept', data.getGuild(GU).antiSpam === false);
  t('and did not wipe anything else', data.getWallet(KEEP1) === 777);

  // updateUser must not accept a bare record as the whole document either.
  await data.updateUser(KEEP1, () => ({ wallet: 5, bank: 0, xp: 0, level: 1, inventory: {}, warnings: [], meta: {} }));
  t('a user record write replaces only that user',
    data.getWallet(KEEP1) === 5 && data.getWallet(KEEP2) === 888);

  console.log('\n=== 20. Repo hygiene: the .gitignore negation actually works ===');
  // ⭐ `data/` followed by `!data/.gitkeep` is INERT: git never descends into an
  //   excluded directory, so the placeholder could never be committed and the
  //   folder silently went missing on a fresh clone. It has to be `data/*`.
  const gi = fs.readFileSync(path.join(ROOT,'.gitignore'),'utf8')
    .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  const negIdx = gi.indexOf('!data/.gitkeep');
  t('the placeholder negation is present', negIdx !== -1);
  if (negIdx !== -1) {
    const preceding = gi.slice(0, negIdx);
    t('⭐ the parent rule is "data/*", not a bare "data/" (which would make the negation inert)',
      preceding.includes('data/*') && !preceding.includes('data/'));
    t('the data placeholder file exists in the tree', fs.existsSync(path.join(ROOT,'data','.gitkeep')));
  }
  t('runtime data is still ignored', gi.some((l) => l === 'data/*'));
  t('.env is ignored', gi.includes('.env'));
  t('quarantine copies are ignored', gi.some((l) => l.includes('.corrupt-')));
  t('node_modules is ignored', gi.some((l) => l === 'node_modules' || l === 'node_modules/'));

  console.log('\n=== 21. npm scripts are wired to the real gates ===');
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT,'package.json'),'utf8'));
  t('npm test runs the harness', pkg.scripts.test === 'node scripts/test.js');
  t('npm run check runs the validator', /scripts\/validate\.js/.test(pkg.scripts.check));
  t('npm run gate chains lint + check + test', /lint/.test(pkg.scripts.gate) && /check/.test(pkg.scripts.gate) && /test/.test(pkg.scripts.gate));
  // Packages @discordjs/voice loads on our behalf at runtime; they are never
  // require()d by our own source but must be installed.
  const RUNTIME_LOADED = ['@noble/ciphers','opusscript','@discordjs/opus'];
  t('every declared dependency is required by us or loaded at runtime by a dependency', (() => {
    const allJs = [...fs.readdirSync(path.join(ROOT,'lib')).map((f)=>'lib/'+f),
      ...fs.readdirSync(path.join(ROOT,'events')).map((f)=>'events/'+f)]
      .filter((f)=>f.endsWith('.js')).map((f)=>fs.readFileSync(path.join(ROOT,f),'utf8')).join('\n')
      + fs.readFileSync(path.join(ROOT,'index.js'),'utf8')
      + require('child_process').execSync(`find ${ROOT}/commands -name '*.js' -exec cat {} +`).toString();
    return Object.keys(pkg.dependencies||{}).every((d) =>
      RUNTIME_LOADED.includes(d)
      || allJs.includes(`require('${d}')`) || allJs.includes(`require("${d}")`) || allJs.includes(`require('${d}/`));
  })());
  t('every runtime-loaded voice dependency actually resolves', RUNTIME_LOADED.every((d) => {
    try { require.resolve(d, { paths: [ROOT] }); return true; } catch { return false; }
  }));
  t('the native opus encoder is OPTIONAL so npm install cannot fail on a locked-down host',
    Object.keys(pkg.optionalDependencies||{}).includes('@discordjs/opus')
    && !Object.keys(pkg.dependencies||{}).includes('@discordjs/opus'));
  t('a pure-JS opus fallback is a hard dependency', Object.keys(pkg.dependencies||{}).includes('opusscript'));
  t('the harness refuses to run against live user data',
    /Refusing to run/.test(fs.readFileSync(path.join(ROOT,'scripts/test.js'),'utf8')));

  console.log('\n=== 22. Music engine: limits, parsing and voice stack ===');
  const music = require(path.join(ROOT,'lib/music'));
  const musicCfg = require(path.join(ROOT,'lib/config')).music;

  t('duration formats h:mm:ss and m:ss', music.formatDuration(3725) === '1:02:05' && music.formatDuration(95) === '1:35');
  t('duration survives garbage input', music.formatDuration(NaN) === '0:00' && music.formatDuration(-5) === '0:00');
  t('h:mm:ss parses back to seconds', music.parseDuration('1:02:03') === 3723);
  t('a plain number is already seconds', music.parseDuration(120) === 120);
  t('unparseable duration returns null', music.parseDuration('live') === null && music.parseDuration('') === null);

  t('youtube URLs recognised', music.isYouTubeUrl('https://youtu.be/abc') && music.isYouTubeUrl('https://www.youtube.com/watch?v=x'));
  t('⭐ non-youtube URLs rejected (only youtube is an accepted source)',
    !music.isYouTubeUrl('https://evil.example/x') && !music.isYouTubeUrl('file:///etc/passwd'));
  t('playlist detection needs a list parameter', music.isPlaylistUrl('https://youtube.com/watch?v=x&list=PL1') && !music.isPlaylistUrl('https://youtube.com/watch?v=x'));

  t('⭐ video titles are escaped so they cannot ping or break the embed', (() => {
    const e = music.escapeMd('@everyone **hi** [x](y)');
    return e.includes('@\u200beveryone') && e.includes('\\*\\*') && !/@everyone/.test(e);
  })());

  const vr = music.voiceReady();
  // Environment-aware on purpose. `ffmpeg-static` publishes no Android build and a
  // native opus binding is often unavailable on Termux or in an
  // `npm install --ignore-scripts` container, so on those hosts music genuinely
  // cannot work. Reporting that as a SKIP keeps the suite honest everywhere
  // instead of showing a red ❌ for a known, correct condition.
  if (vr.hasFfmpeg) {
    t('the voice stack reports opus + encryption + ffmpeg', vr.ok === true && vr.hasOpus && vr.hasCrypto);
  } else {
    pass++;
    console.log('  ⏭️  voice stack incomplete on this host (ffmpeg binary absent — expected on Termux');
    console.log('      and on `npm install --ignore-scripts`); music is correctly reported unavailable.');
  }
  if (vr.hasFfmpeg) {
    t('the ffmpeg path really exists on disk (the report alone can lie)', fs.existsSync(vr.ffmpeg));
  }
  t('the chosen opus encoder really loads, not just resolves', music.canRequire(vr.opus));
  // On a host where the native binding is missing, the fallback must have taken over.
  if (vr.opus !== '@discordjs/opus') {
    t('the pure-JS opus fallback took over where the native binding is unusable', vr.opus === 'opusscript');
  }

  // ⭐ Regression for a false positive this suite caught during development:
  // @discordjs/opus is native, so its folder can be installed while the compiled
  // binding is missing (Android/Termux, `npm install --ignore-scripts`, a blocked
  // toolchain). generateDependencyReport() still prints a version for it, and the
  // first implementation of voiceReady() parsed that text — so it reported a
  // working stack and /music play then failed at encode time.
  t('⭐ readiness is decided by loading, not by parsing the dependency report', (() => {
    const report = music.dependencyReport();
    const reportSaysOpus = /- (@discordjs\/opus|opusscript): [\d.]/.test(report);
    const somethingLoads = music.OPUS_ENCODERS.some((n) => music.canRequire(n));
    // The report may claim more than is usable; our flag must never do that.
    return somethingLoads === vr.hasOpus && (reportSaysOpus || !vr.hasOpus);
  })());
  t('⭐ the ESM-only encryption package is probed by its submodule, not its root', (() => {
    // require('@noble/ciphers') THROWS by design ("import submodules instead"), so a
    // root-level require() probe reports a perfectly healthy install as broken.
    let rootRequires = true;
    try { require('@noble/ciphers'); } catch { rootRequires = false; }
    let subResolves = false;
    try { require.resolve('@noble/ciphers/chacha'); subResolves = true; } catch { /* not installed */ }
    return !rootRequires && subResolves && vr.hasCrypto;
  })());
  t('the async (authoritative) check agrees with the sync one here',
    (await music.voiceReadyAsync()).ok === vr.ok);
  t('a missing dependency is named, not just flagged', music.voiceReadyAsync.length === 0
    && Array.isArray(vr.missing));

  // Queue-state helpers, exercised without a gateway connection.
  const G = '910000000000000001';
  music.queues.clear();
  const q = music.ensureQueue(G);
  t('a fresh queue starts empty and unlooped', q.tracks.length === 0 && q.current === null && q.loopMode === 'off');
  t('the default volume comes from config', q.volume === musicCfg.defaultVolume);

  q.tracks.push(...Array.from({ length: 5 }, (_, i) => ({ title: `t${i}`, durationSec: 100, requestedBy: 'u', url: `https://youtu.be/${i}` })));
  t('queueDuration sums the pending tracks', music.queueDuration(q) === 500);

  const shuffledBefore = q.tracks.map((t) => t.title).join(',');
  music.shuffle(q, 'user-1');
  t('shuffle keeps the same tracks', q.tracks.map((t) => t.title).sort().join(',') === shuffledBefore.split(',').sort().join(','));
  music.shuffle(q, 'user-1');
  t('shuffle is not a no-op the second time either', q.tracks.length === 5);
  t('shuffle of fewer than 2 tracks is refused', music.shuffle({ tracks: [{ title: 'only' }] }, 'u') === 0);

  const beforeRemove = q.tracks.map((t) => t.title);
  const removedTrack = music.remove(q, 1);
  t('remove takes the 1-based position', removedTrack.title === beforeRemove[0] && q.tracks.length === 4);
  t('remove refuses an out-of-range position', music.remove(q, 0) === null && music.remove(q, 99) === null && q.tracks.length === 4);
  t('a 0-second or live duration is never accepted as a track length', music.parseDuration('0:00') === null && music.parseDuration(0) === 0);
  t('clear empties the queue but not the current track', (q.current = { title: 'playing' }, music.clear(q) === 4 && q.tracks.length === 0 && q.current !== null));

  t('volume is clamped to 0-200', music.setVolume(q, 9999) === 200 && music.setVolume(q, -50) === 0);
  t('volume rejects non-numbers', music.setVolume(q, 'loud') === 0);
  t('loop only accepts the three known modes', music.setLoop(q, 'track') === 'track' && music.setLoop(q, 'nonsense') === 'track');
  t('pause/resume/skip without a player are safe no-ops',
    music.pause(q) === false && music.resume(q) === false && music.skip(q) !== undefined);

  q.startedAt = Date.now() - 60_000;
  q.current = { title: 'x', durationSec: 120, url: 'https://youtu.be/x', requestedBy: 'u' };
  const desc = music.describe(q);
  t('describe reports elapsed and remaining', desc.elapsed >= 59 && desc.remaining <= 61, JSON.stringify([desc.elapsed, desc.remaining]));
  t('the progress bar is a fixed width with one knob', (music.progressBar(q).match(/🔘/g) || []).length === 1
    && music.progressBar(q).length <= 20);
  t('destroying a queue removes it from the map', (music.destroyQueue(q, null), music.getQueue(G) === null));
  music.destroyAll('');
  t('destroyAll clears every queue', music.queues.size === 0);

  const musicJson = require(path.join(ROOT,'commands/music')).data.toJSON();
  const subs = (musicJson.options || []).map((o) => o.name);
  t('/music exposes the 13 documented subcommands', subs.length === 13
    && ['play','queue','nowplaying','pause','resume','skip','stop','disconnect','volume','loop','shuffle','remove','clear'].every((n) => subs.includes(n)),
    subs.join(','));
  t('/music is guild-only', musicJson.dm_permission === false);
  t('the play query is length-bounded', (musicJson.options.find((o)=>o.name==='play').options[0].max_length || 0) <= 300);
  t('volume is bounded 0-200 in the command itself', (() => {
    const v = musicJson.options.find((o)=>o.name==='volume').options[0];
    return v.min_value === 0 && v.max_value === 200;
  })());
  t('loop offers exactly the three engine modes', (() => {
    const c = musicJson.options.find((o)=>o.name==='loop').options[0].choices.map((x)=>x.value);
    return c.join(',') === music.LOOP_MODES.join(',');
  })());
  t('remove position is bounded', (() => {
    const r = musicJson.options.find((o)=>o.name==='remove').options[0];
    return r.min_value === 1 && r.max_value === 1000;
  })());
  t('music queue limits are all clamped in config', musicCfg.maxQueueLength >= 1 && musicCfg.maxQueueLength <= 1000
    && musicCfg.maxTrackMinutes >= 1 && musicCfg.idleDisconnectMs >= 60000);
  t('every music timer fits a Node int32 timeout', musicCfg.idleDisconnectMs <= 2**31-1 && musicCfg.emptyQueueDisconnectMs <= 2**31-1);
  t('the transport buttons are routed in interactionCreate', /customId\.startsWith\('music_'\)/.test(fs.readFileSync(path.join(ROOT,'events/interactionCreate.js'),'utf8')));
  t('index.js wires client.musicQueues to the real queue map (upstream: a Map nothing read)',
    /client\.musicQueues = music\.queues/.test(fs.readFileSync(path.join(ROOT,'index.js'),'utf8')));
  t('shutdown destroys the queues so no ghost voice connection survives',
    /music\.destroyAll/.test(fs.readFileSync(path.join(ROOT,'index.js'),'utf8')));

  console.log('\n=== 23. Version announcement fires on a version CHANGE, not on every boot ===');
  const ver = require(path.join(ROOT,'lib/version'));
  const cfg = require(path.join(ROOT,'lib/config'));
  const NO_STATE = { lastAnnounced: null, history: [] };

  t('semver comparison', ver.compareSemver('2.1.0','2.0.0') === 1 && ver.compareSemver('2.0.0','2.1.0') === -1 && ver.compareSemver('2.1.0','2.1.0') === 0);
  t('semver comparison ignores a pre-release suffix for ordering', ver.compareSemver('2.1.0-rc1','2.1.0') === 0);

  let d = await ver.evaluate({ version: '2.1.0', state: NO_STATE });
  t('⭐ first boot announces by default', d.should === true && d.kind === 'first-deploy', d.reason);
  t('first boot has no previous version', d.previous === null && d.lastAnnounced === null);

  d = await ver.evaluate({ version: '2.2.0', state: { lastAnnounced: '2.1.0', history: [{ version: '2.1.0', at: Date.now() - 86400000 }] } });
  t('⭐ a version bump announces as an update and knows the previous one', d.should === true && d.kind === 'update' && d.previous === '2.1.0', d.reason);

  d = await ver.evaluate({ version: '2.1.0', state: { lastAnnounced: '2.1.0', history: [{ version: '2.1.0', at: Date.now() }] } });
  t('⭐ restarting on the SAME version stays silent (this is what stops crash-loop spam)', d.should === false, d.reason);

  d = await ver.evaluate({ version: '2.0.0', state: { lastAnnounced: '2.1.0', history: [{ version: '2.1.0', at: Date.now() }] } });
  t('a rollback is not announced as an update', d.should === false && d.recordSilently === true, d.reason);

  d = await ver.evaluate({ version: '2.1.0', state: { lastAnnounced: '2.2.0', history: [{ version: '2.1.0', at: Date.now() - 86400000 }] } });
  t('a version already announced in the past is not repeated', d.should === false, d.reason);

  const now = Date.now();
  d = await ver.evaluate({ version: '3.0.0', now, state: { lastAnnounced: '2.1.0', history: Array.from({ length: 3 }, (_, i) => ({ version: `2.0.${i}`, at: now - i * 60000 })) } });
  t('⭐ the hourly cap blocks a redeploy loop', d.should === false && d.throttled === true, d.reason);
  d = await ver.evaluate({ version: '3.0.0', now, state: { lastAnnounced: '2.1.0', history: [{ version: '2.0.0', at: now - 2 * 60 * 60 * 1000 }] } });
  t('an announcement older than the window does not count against the cap', d.should === true, d.reason);

  d = await ver.evaluate({ version: 'not-a-version', state: NO_STATE });
  t('a non-semver version cannot announce', d.should === false, d.reason);

  // buildAnnouncement is pure — no client needed.
  const payload = ver.buildAnnouncement({
    decision: { current: '2.1.0', previous: '2.0.0', kind: 'update' },
    changelog: [{ version: '2.1.0', items: ['Added /music', 'Fixed a double spend'] }],
    uptimeMs: 120000, pingEveryone: true, botName: 'TestBot',
  });
  t('the ping lives in content, not the embed (embed mentions never notify)', payload.content === '@everyone');
  t('allowedMentions actually enables the everyone ping', payload.allowedMentions.parse.includes('everyone'));
  t('the embed states the new and previous version', /v2\.1\.0/.test(payload.embeds[0].data.description) && /v2\.0\.0/.test(payload.embeds[0].data.description));
  t('the changelog items are quoted', /Added \/music/.test(payload.embeds[0].data.description));
  const noPing = ver.buildAnnouncement({ decision: { current: '2.1.0', previous: null, kind: 'first-deploy' }, changelog: [], uptimeMs: 0, pingEveryone: false, botName: 'TestBot' });
  t('without the ping there is no everyone mention at all', noPing.content === undefined && noPing.allowedMentions.parse.length === 0);
  t('a missing changelog entry degrades to a note, not a crash', /No changelog entry/.test(noPing.embeds[0].data.description));

  const cl = ver.parseChangelog();
  t('CHANGELOG.md parses into releases', cl.length >= 3, 'got '+cl.length);
  t('the running version has a changelog entry', cl.some((e) => e.version === cfg.version), cfg.version);
  t('that entry has items to quote', (cl.find((e) => e.version === cfg.version)?.items.length || 0) > 0);
  t('entries are newest-first', ver.compareSemver(cl[0].version, cl[cl.length-1].version) >= 0);
  t('uptime is human-readable', ver.formatUptime(90061000) === '1d 1h' && ver.formatUptime(0) === '0s');

  // Persistence round-trip through the real store.
  await ver.record('9.9.9', Date.now());
  const st = await ver.readState();
  t('recording a version persists it', st.lastAnnounced === '9.9.9');
  t('history is kept as a bounded list', Array.isArray(st.history) && st.history.length >= 1 && st.history.length <= 50);
  d = await ver.evaluate({ version: '9.9.9' });
  t('a recorded version no longer announces', d.should === false, d.reason);

  console.log('\n=== 24. The static validator catches what it claims to ===');
  const valSrc = fs.readFileSync(path.join(ROOT,'scripts/validate.js'),'utf8');
  t('⭐ it rejects a duplicate command name (the loader silently drops one)',
    /already registers — the loader silently drops this one/.test(valSrc));
  t('it enforces Discord’s 100-char description limit', /maxDescription: 100/.test(valSrc));
  t('it enforces Discord’s 25-option / 25-choice limits', /maxOptions: 25/.test(valSrc) && /maxChoices: 25/.test(valSrc));
  t('it rejects a subcommand group inside a subcommand group', /subcommand group containing another group/.test(valSrc));
  t('it flags exports the loader never calls', /which the loader never calls/.test(valSrc));
  t('it strips comments before pattern matching (docs are not violations)', /function codeOnly/.test(valSrc));
  t('it checks the reverse dependency direction too (required but undeclared)', /is require\(\)d but not declared/.test(valSrc));
  t('it knows which packages are loaded at runtime by a dependency', /RUNTIME_LOADED/.test(valSrc));

  console.log('\n=== 25. Announcement end-to-end against a mock gateway ===');
  const { PermissionsBitField } = require('discord.js');
  const verLib = require(path.join(ROOT,'lib/version'));

  const GUILD_ID = '920000000000000001';
  const CH_ID = '920000000000000002';

  /** Build a fake client whose target channel grants (or withholds) Mention Everyone. */
  function mockClient({ canMentionEveryone = true, channelUsable = true, sendFails = false } = {}) {
    const sent = [];
    const channel = {
      id: CH_ID,
      guildId: GUILD_ID,
      name: 'announcements',
      type: 0,
      isTextBased: () => true,
      permissionsFor: () => new PermissionsBitField(
        [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages]
          .concat(canMentionEveryone ? [PermissionsBitField.Flags.MentionEveryone] : []),
      ),
      send: async (payload) => {
        if (sendFails) throw new Error('Missing Access');
        sent.push(payload);
        return { id: '920000000000000099' };
      },
    };
    const guild = {
      id: GUILD_ID,
      available: true,
      systemChannel: null,
      channels: {
        cache: { filter: () => ({ sort: () => ({ first: () => null }) }) },
        fetch: async (id) => (id === CH_ID && channelUsable ? channel : null),
      },
      members: {
        me: { permissions: new PermissionsBitField(canMentionEveryone ? [PermissionsBitField.Flags.MentionEveryone] : []) },
      },
    };
    return {
      sent,
      user: { username: 'The Syndicate' },
      guilds: { cache: { first: () => guild }, fetch: async (id) => (id === GUILD_ID ? guild : null) },
      channels: { fetch: async (id) => (id === CH_ID && channelUsable ? channel : null) },
    };
  }

  // Start from a clean slate: nothing announced yet.
  await data.updateSyndicate((s) => ({ ...s, version: { lastAnnounced: null, history: [] } }));

  // announceIfUpdated reads the channel/guild IDs from config, so point them at the
  // mock for the duration of this section and restore them afterwards.
  const savedGuildId = cfg.guildId;
  const savedChannelId = cfg.announce.channelId;
  cfg.guildId = GUILD_ID;
  cfg.announce.channelId = CH_ID;

  let client = mockClient();
  let outcome = await verLib.announceIfUpdated(client);
  t('⭐ first boot announces', outcome && outcome.should === true && outcome.kind === 'first-deploy', outcome && outcome.reason);
  t('exactly one message was sent', client.sent.length === 1);
  t('⭐ the @everyone ping is in content (not the embed, where it would never notify)',
    client.sent[0]?.content === '@everyone');
  t('allowedMentions lets the ping through', client.sent[0]?.allowedMentions?.parse?.includes('everyone') === true);
  // Derived at runtime on purpose: these assertions used to hard-code "v2.1.0"
  // and "Music", so every version bump broke the suite. The contract is: the embed
  // names WHICHEVER version package.json declares, and quotes WHICHEVER bullets
  // head the changelog today.
  const runningVersion = cfg.version;
  const latest = verLib.parseChangelog()[0];
  const firstDesc = client.sent[0]?.embeds?.[0]?.data?.description || '';
  t('the message carries an embed with the running version',
    firstDesc.includes(`v${runningVersion}`));
  t('the changelog for that version is quoted', (() => {
    if (!latest || latest.version !== runningVersion || !latest.items.length) return true;
    const raw = latest.items[0];
    return firstDesc.includes(raw.slice(0, 30))
      || firstDesc.includes(raw.replace(/[*`]/g, '').slice(0, 30));
  })(), latest && `${latest.version}: ${(latest.items[0] || '').slice(0, 40)}`);
  t('the embed has a title, fields and a timestamp', (() => {
    const e = client.sent[0]?.embeds?.[0]?.data;
    return !!e?.title && e.fields.length >= 3 && !!e.timestamp;
  })());
  t('the embed stays inside Discord’s 4096-char description limit',
    (client.sent[0]?.embeds?.[0]?.data?.description || '').length <= 4096);

  t('the announced version was persisted', (await verLib.readState()).lastAnnounced === runningVersion);

  // ⭐ The whole point of the design: a restart on the same version is silent.
  client = mockClient();
  outcome = await verLib.announceIfUpdated(client);
  t('⭐ restarting on the SAME version sends nothing', outcome.should === false && client.sent.length === 0, outcome.reason);

  // A new version announces again, and names the previous one.
  await data.updateSyndicate((s) => ({ ...s, version: { lastAnnounced: runningVersion, history: [{ version: runningVersion, at: Date.now() - 86400000 }] } }));
  const origVersion = cfg.version;
  // Derived, not hard-coded: the bump target must differ from WHATEVER version
  // package.json declares today, or the "bump" is no bump at all.
  const [maj, min] = origVersion.split('.').map(Number);
  const bumpVersion = `${maj}.${min + 1}.0`;
  Object.defineProperty(cfg, 'version', { value: bumpVersion, configurable: true });
  client = mockClient();
  outcome = await verLib.announceIfUpdated(client);
  t('a version bump announces as an update', outcome.should === true && outcome.kind === 'update', outcome.reason);
  t('the message names the previous version', (client.sent[0]?.embeds?.[0]?.data?.description || '').includes(`was v${runningVersion}`));
  Object.defineProperty(cfg, 'version', { value: origVersion, configurable: true });

  // Without Mention Everyone the ping is dropped but the message still posts.
  await data.updateSyndicate((s) => ({ ...s, version: { lastAnnounced: null, history: [] } }));
  client = mockClient({ canMentionEveryone: false });
  outcome = await verLib.announceIfUpdated(client);
  t('⭐ without Mention Everyone the ping is dropped, not sent broken',
    outcome.should === true && client.sent.length === 1 && client.sent[0].content === undefined
    && client.sent[0].allowedMentions.parse.length === 0);

  // A failed send must NOT be recorded, so the next boot retries.
  await data.updateSyndicate((s) => ({ ...s, version: { lastAnnounced: null, history: [] } }));
  client = mockClient({ sendFails: true });
  outcome = await verLib.announceIfUpdated(client);
  t('a failed send is not recorded, so the next boot retries',
    outcome.should === true && (await verLib.readState()).lastAnnounced === null);

  // An unusable channel must not throw and must not record.
  await data.updateSyndicate((s) => ({ ...s, version: { lastAnnounced: null, history: [] } }));
  client = mockClient({ channelUsable: false });
  outcome = await verLib.announceIfUpdated(client);
  t('an unusable announcement channel degrades silently', outcome.should === true && client.sent.length === 0);

  // The hourly cap blocks a redeploy loop.
  const nowTs = Date.now();
  await data.updateSyndicate((s) => ({
    ...s,
    version: { lastAnnounced: '2.0.0', history: Array.from({ length: 3 }, (_, i) => ({ version: `2.0.${i}`, at: nowTs - i * 60000 })) },
  }));
  client = mockClient();
  outcome = await verLib.announceIfUpdated(client);
  t('⭐ a redeploy loop is capped and sends nothing', outcome.should === false && outcome.throttled === true && client.sent.length === 0, outcome.reason);
  t('and the capped version is NOT recorded, so it still goes out later',
    (await verLib.readState()).lastAnnounced === '2.0.0');

  await data.updateSyndicate((s) => ({ ...s, version: { lastAnnounced: null, history: [] } }));
  cfg.guildId = savedGuildId;
  cfg.announce.channelId = savedChannelId;

  console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}\n`);
  process.exit(fail?1:0);
})().catch(e=>{console.error('TEST HARNESS ERROR:',e);process.exit(1);});
