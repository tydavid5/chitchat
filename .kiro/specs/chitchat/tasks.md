# ChitChat: Tasks

- [x] 1. Project scaffold
  - [x] 1.1 Create `app/index.html` with the room join/create screen, the chat view, the ledger view, and the balance board
  - [x] 1.2 Create `app/styles.css`, phone-first, blue and white with a warm orange accent, no sideways scrolling on a 360px screen
  - [x] 1.3 Create `app/app.js` with room state and the Supabase client wired to the existing free project
  - [x] 1.4 Show the "Demo: pretend balances, no real money moves" label on every screen

- [x] 2. Rooms and live chat
  - [x] 2.1 Generate a random 4-letter room code on create, join by code, join by `?room=CODE` link
  - [x] 2.2 Display name per device, stored in localStorage, editable
  - [x] 2.3 Broadcast chat messages over the room channel, show history on join
  - [x] 2.4 Presence for the member list, with a 10-second grace before pruning a vanished member
  - [x] 2.5 Typing indicator, and keep the typed draft across re-renders

- [x] 3. Money parser
  - [x] 3.1 Detect amounts with currency markers (N, NGN, naira, $, USD, ₦), commas, and decimals
  - [x] 3.2 Detect the split: "split N ways", named members, "for A and B", default all members
  - [x] 3.3 Build a draft chit (payer, amount, split, note) and show it to the payer only
  - [x] 3.4 Confirm, Edit, and Dismiss on the draft; nothing counts until confirmed
  - [x] 3.5 Manual "Add expense" form as a fallback when the parser proposes nothing

- [x] 4. Ledger and balances
  - [x] 4.1 Ledger list, newest first, with payer, amount, split, note, and time
  - [x] 4.2 Edit and delete of your own chits, syncing to all members
  - [x] 4.3 Net balance per member, recomputed on every ledger change
  - [x] 4.4 Simplified debts (greedy largest debtor to largest creditor) shown as "A owes B"

- [x] 5. Settle
  - [x] 5.1 One-tap settle on a debt, recorded as a settlement in the ledger
  - [x] 5.2 "Fully settled" state when all debts are zero
  - [x] 5.3 Undo a settlement

- [x] 6. Ledger MCP server
  - [x] 6.1 Implement `tools/ledger-mcp/server.mjs` (Node stdio MCP server) with `ledger_add_entry`, `ledger_balances`, `ledger_settle`
  - [x] 6.2 Local JSON store at `tools/ledger-mcp/ledger.json`, used by the MCP server only
  - [x] 6.3 Wire it in `.kiro/settings/mcp.json`

- [ ] 7. Checks
  - [x] 7.1 `node --check` passes on every JS file
  - [x] 7.2 Parser unit checks pass, including "lol ok" proposing nothing
  - [ ] 7.3 Two-tab live test: message, draft, confirm, balances, settle all match on both tabs (NOT done here: no real browser in this environment, jsdom has no WebSocket so Supabase Realtime could not connect. Local flows verified in jsdom, 23/23 checks. The live two-tab check needs a real browser.)

- [ ] 8. Docs for the repo
  - [ ] 8.1 README.md opening with the problem sentence, then how it works, then the Kiro usage write-up
  - [ ] 8.2 MIT LICENSE file
  - [ ] 8.3 `.kiro/` committed at the repo root, not in `.gitignore`
