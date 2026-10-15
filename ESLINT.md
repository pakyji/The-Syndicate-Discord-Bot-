# Lint configuration notes

`npm run lint` uses `.eslintrc.json`.

## Why `require-atomic-updates` is disabled

The rule reports every assignment to an outer-scope variable that happens after
an `await`. In an event-driven Discord bot this fires on ordinary, correct
single-threaded patterns:

```js
let lastPingTime = 0;
setInterval(async () => {
    await doWork();
    lastPingTime = Date.now();   // flagged, but Node is single-threaded here
}, 30 * 60 * 1000);
```

Node runs one microtask at a time, so this is not a data race. The genuinely
risky cases in this codebase are handled explicitly instead:

| Risk | How it is handled |
|---|---|
| Two users spending the same coins | `store.spend()` performs the check and the deduction inside one serialised `mutate()` |
| Concurrent JSON writes | `lib/store.js` keeps a per-file mutex, so read-modify-write cycles cannot interleave |
| Two users claiming one coin drop | `events/ready.js` uses a `winnerId` guard with **no `await` between the check and the assignment** |
| Lost updates under load | Verified by `scripts/validate.js` and the 50-concurrent-increment assertion in the test suite |

Keep the rule off, but do not reintroduce check-then-act patterns across an
`await` for shared mutable state — use the store's serialised `mutate()` instead.
