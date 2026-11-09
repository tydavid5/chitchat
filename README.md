# ChitChat

Splitting money with friends means a spreadsheet nobody updates and a chat full of "you owe me" messages nobody can add up.

ChitChat is a group chat that is the ledger. You talk about money normally, the app turns money mentions into ledger entries, a live balance board shows who owes whom, and one tap settles up. It stitches three things that normally live apart, a chat app, a spreadsheet, and a settlement calculator, into one place.

## How it works

1. Create a room and share the 4-letter code, or join with a link. No account, no sign-in.
2. Chat normally. Write "I paid 12,000 for dinner split 4 ways" and the app proposes a draft chit.
3. Confirm the draft with one tap, or edit it first, or dismiss it. Nothing counts until you confirm.
4. The balance board shows every member's net balance and the smallest set of payments that settles the room, as "Ada owes Five 6,000".
5. Tap settle on a debt to record it as paid. You can undo a settlement.

The money parser is pattern-based, not magic. It spots amounts and splits in your messages and proposes a draft. It understands N, NGN, naira, $, USD, and ₦, commas and decimals, "split N ways", named members, and "for A and B". If it cannot understand a message, it proposes nothing. There is also a manual Add expense form.

## Demo, honestly labelled

This is a demo with pretend balances. No real money moves in the app. Settling only records that a debt was paid. The app says so on every screen.

## Tech

- Single-page web app. One HTML file, one CSS file, one JS file. No build step, no framework.
- Live sync with Supabase Realtime Broadcast and Presence, on the free tier, under the `chitchat-room-CODE` channel namespace. The key shipped is the publishable anon key. Broadcasts are fire-and-forget, so a client that misses one pulls the room state again: every sync-state is merged, and a sync is requested when the tab becomes visible, when the window regains focus, when the Ledger or Balances tab opens, and on a 20-second heartbeat.
- Phone-first layout, works in a mobile browser.
- `node --check` passes on every JS file. Parser and balance logic has 31 passing checks in `tools/ledger-mcp/test-parser.js` (`node tools/ledger-mcp/test-parser.js`).

## How Kiro was used

ChitChat was built for Kiroween 2026 (Frankenstein category) with Kiro, spec-driven from the start:

- **Specs**: the build followed a written spec in `.kiro/specs/chitchat/` (requirements, design, tasks) before any app code was written, and the task list was checked off as the work landed.
- **Steering**: product, tech, and structure steering docs in `.kiro/steering/` kept the build phone-first, dependency-free, and honestly labelled.
- **Agent hooks**: a hook in `.kiro/hooks/` runs `node --check` on JS files when they are saved.
- **MCP**: the ledger MCP server in `tools/ledger-mcp/` exposes `ledger_add_entry`, `ledger_balances`, and `ledger_settle` over stdio, configured in `.kiro/settings/mcp.json`, so Kiro agents working on the ledger use the same operations as the app.
- **Kiro CLI**: installed and used in the build environment (version 3.1.0).

## Run it locally

```bash
cd app
python3 -m http.server 8000
```

Open http://localhost:8000, create a room, open the same link in a second tab or phone, and join with the code.

## Repo layout

```
.kiro/            Specs, steering, hooks, MCP config (committed, never gitignored)
app/              index.html, styles.css, app.js
tools/ledger-mcp/ Ledger MCP server (server.mjs) and its local JSON store, plus the parser and balance checks (test-parser.js)
README.md
LICENSE           MIT
```

## License

MIT. See LICENSE.
