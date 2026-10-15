/**
 * Silent-drop audit — `npm run audit`.
 *
 * A companion to scripts/validate.js. Where the validator asks "is this file
 * well-formed?", this asks "will the LOADER actually use it, and will Discord
 * accept it?" — the two questions whose negative answers are silent:
 *
 *   • a duplicate command name is de-duplicated by index.js and the second file
 *     simply never runs (that is how a redundant commands/utility/poll.js hid a
 *     still-broken /poll);
 *   • an event file missing {name, execute} is skipped with a console warning;
 *   • a lib module nobody requires is dead weight;
 *   • an export the loader never calls is dead code;
 *   • a description over 100 chars, more than 25 options/choices, or a subcommand
 *     group inside a group makes PUT /commands reject the WHOLE batch with a 400,
 *     so one bad command silently stops every other command registering.
 *
 * Exits non-zero when anything is found, so it can gate a deploy.
 */
const fs = require('fs'), path = require('path');
const ROOT = process.argv[2] || path.join(__dirname, '..');
function walk(d, out = []) {
    for (const f of fs.readdirSync(d)) {
        const p = path.join(d, f), s = fs.statSync(p);
        if (s.isDirectory()) { if (['node_modules', '.git', 'scripts'].includes(f)) continue; walk(p, out); }
        else if (f.endsWith('.js')) out.push(p);
    }
    return out;
}
const cmd = walk(path.join(ROOT, 'commands')), ev = walk(path.join(ROOT, 'events')), lib = walk(path.join(ROOT, 'lib'));
const bad = [], names = new Map();
function checkOpts(file, opts, depth) {
    for (const o of opts || []) {
        if (o.name && o.name.length > 32) bad.push(['OPTION NAME >32', path.relative(ROOT, file), o.name]);
        if (o.name && !/^[a-z0-9-_]+$/.test(o.name)) bad.push(['BAD OPTION NAME', path.relative(ROOT, file), o.name]);
        if (o.description && o.description.length > 100) bad.push(['OPTION DESC >100', path.relative(ROOT, file), `${o.name} (${o.description.length})`]);
        if ((o.choices || []).length > 25) bad.push(['>25 CHOICES', path.relative(ROOT, file), o.name]);
        if (o.type === 3 && o.choices && o.choices.length < 2) bad.push(['STRING OPT WITH 1 CHOICE', path.relative(ROOT, file), o.name]);
        // Discord allows at most: command -> subcommand GROUP -> subcommand -> options.
        // A group containing another group is rejected by the API at registration.
        if (o.type === 1 && (o.options || []).some((c) => c.type === 1)) {
            bad.push(['SUBCOMMAND GROUP INSIDE A GROUP', path.relative(ROOT, file), o.name]);
        }
        if (o.type === 1 && depth >= 1) {
            bad.push(['OPTIONS NESTED TOO DEEP', path.relative(ROOT, file), o.name]);
        }
        if (o.options) checkOpts(file, o.options, depth + 1);
    }
}
for (const f of cmd) {
    let m; try { m = require(f); } catch (e) { bad.push(['LOAD FAIL', path.relative(ROOT, f), e.message.split('\n')[0]]); continue; }
    if (!m || !m.data || typeof m.execute !== 'function') { bad.push(['MALFORMED COMMAND', path.relative(ROOT, f), '']); continue; }
    const j = typeof m.data.toJSON === 'function' ? m.data.toJSON() : m.data;
    if (names.has(j.name)) bad.push(['DUPLICATE COMMAND', path.relative(ROOT, f), 'vs ' + names.get(j.name)]);
    else names.set(j.name, path.relative(ROOT, f));
    if (j.name.length > 32 || !/^[a-z0-9-_]+$/.test(j.name)) bad.push(['BAD COMMAND NAME', path.relative(ROOT, f), j.name]);
    if (!j.description || j.description.length > 100) bad.push(['CMD DESC MISSING/>100', path.relative(ROOT, f), String(j.description?.length)]);
    if ((j.options || []).length > 25) bad.push(['>25 OPTIONS', path.relative(ROOT, f), String(j.options.length)]);
    checkOpts(f, j.options, 0);
    for (const k of Object.keys(m)) if (!['data', 'execute', 'category', 'name', 'once'].includes(k)) bad.push(['UNUSED EXPORT', path.relative(ROOT, f), k]);
}
for (const f of ev) {
    let m; try { m = require(f); } catch (e) { bad.push(['EVENT LOAD FAIL', path.relative(ROOT, f), e.message.split('\n')[0]]); continue; }
    if (!m || !m.name || typeof m.execute !== 'function') bad.push(['MALFORMED EVENT', path.relative(ROOT, f), '']);
}
const src = [...cmd, ...ev, ...lib, path.join(ROOT, 'index.js')].map((f) => [f, fs.readFileSync(f, 'utf8')]);
for (const f of lib) {
    const b = path.basename(f, '.js');
    if (!src.some(([o, s]) => o !== f && (s.includes(`lib/${b}'`) || s.includes(`./${b}'`)))) bad.push(['DEAD LIB MODULE', path.relative(ROOT, f), '']);
}
console.log(bad.length ? bad.map((b) => '  • ' + b.join(' — ')).join('\n') : '  ✅ clean');
console.log(`  ${cmd.length} command files -> ${names.size} unique names | ${ev.length} event handlers | ${lib.length} lib modules`);
process.exit(bad.length ? 1 : 0);
