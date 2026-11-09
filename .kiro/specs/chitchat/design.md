# ChitChat: Design

## Overview

ChitChat is a single-page web app. One HTML file, one CSS file, one JS file, no build step, no framework. Live sync uses Supabase Realtime Broadcast and Presence, the same free setup proven in the Bloop live rooms: a channel per room, `chat` broadcast events for messages, `chit` events for ledger changes, `settle` events for settlements, and Presence for the member list and typing indicators.

The Supabase project is the existing free project already used for Bloop (URL and publishable key as in the Bloop source). ChitChat uses its own channel namespace (`chitchat-room-CODE`), so its traffic never touches Bloop rooms. The key in the repo is the publishable anon key, safe to ship in a public repo by design.

## Architecture

```
app/
  index.html   Entry, layout, room join/create, share link
  styles.css   Blue and white, warm orange accent, phone-first
  app.js       Room state, chat, parser, ledger, balances, settle, sync
tools/
  ledger-mcp/
    server.mjs Ledger MCP server (stdio), tools over a local JSON store
    ledger.json Local store used by the MCP server only
```

No server of our own. The app is static and deploys to free static hosting (Vercel).

## Data model

```js
room = { code: "ABCD", members: [{ id, name }], createdAt }
message = { id, roomCode, senderId, senderName, text, at }
chit = { id, roomCode, payerId, payerName, amount, currency: "NGN",
         splitAmong: [memberId], note, at, by: "parser" | "manual" }
settlement = { id, roomCode, fromId, toId, amount, at }
```

Money is stored as a plain number in the room's currency. The demo defaults to NGN (Naira) because the builder and the first users are in Nigeria, and the parser also accepts $ and USD. Amounts are displayed with thousands separators.

## Money parser

The parser is pattern-based, not magic, and the app says so in the UI. Rules, in order:

1. Find amounts: numbers with optional commas and decimals, optionally preceded or followed by a currency marker (N, NGN, naira, $, USD, ₦).
2. Find the payer: the message sender, unless the message names another member with "paid" or "covered".
3. Find the split: "split 4 ways" or "split between A, B" or "split" alone means all room members; "for A and B" limits the split to named members; no split stated means all members.
4. Find the note: the message text with the amount removed, trimmed.
5. If no amount is found, propose nothing. If the amount is ambiguous (two amounts in one message), propose a draft from the first amount and let the payer edit it.

Every draft is shown to the payer with Confirm, Edit, and Dismiss. Nothing counts until confirmed.

## Balances

Net balance per member = total paid minus total share owed. Debts are simplified greedily: sort debtors by amount owed and creditors by amount due, match the largest debtor to the largest creditor, repeat. This gives the smallest practical set of payments. The board shows both the net balances and the simplified "A owes B" list.

## Live sync

- Channel `chitchat-room-CODE` per room.
- Broadcast `message` for chat, `chit` for confirmed/edited/deleted chits, `settle` for settlements, `typing` for typing indicators.
- Presence tracks members in the room. A member who vanishes stays listed for a 10-second grace before being pruned, so a brief dropout does not flicker the board.
- Draft chits are local only until confirmed. The other members never see an unconfirmed draft.

## Kiro usage (honest record)

- Spec-driven development: this spec (requirements, design, tasks) was written in Kiro spec format before the build, and the build follows the task list.
- Steering docs: product, tech, and structure steering in `.kiro/steering/`.
- Agent hooks: a hook runs `node --check` on JS files when they are saved.
- MCP: the ledger MCP server in `tools/ledger-mcp/` exposes `ledger_add_entry`, `ledger_balances`, and `ledger_settle` over stdio, configured in `.kiro/settings/mcp.json`. It is used by Kiro agents working on the ledger.
- Kiro CLI: installed in the build environment (version 3.1.0). Agent runs need a Builder ID sign-in, which the builder signs in to once.

## Testing

- `node --check` on every JS file after each change.
- Local two-tab test: two browser tabs in the same room, one sends a money message, the other sees the draft only after confirm, balances match on both tabs, settle clears on both.
- Parser unit checks: "I paid 12,000 for dinner split 4 ways", "Taxi 2500 for me and Ada", "Paid $40 for tickets", "lol ok" (no draft).
- No real money, no login, no card anywhere in the build or the demo.
