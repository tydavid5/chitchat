# Product steering

ChitChat is a group chat that is the ledger. Friends split money by talking about it normally, and the app does the maths.

The user is a group of friends, flatmates, or trip mates splitting costs. They are on their phones, at a table, in a taxi, at a restaurant. They will not create an account, they will not open a spreadsheet, and they will not do mental arithmetic for five people.

The product must feel instant: type a message, see the draft, tap confirm, watch the board move. Every extra step loses the room.

The demo is honest: pretend balances, no real money moves, and the parser is pattern-based, not magic. Say so in the app, in the README, and in the video.

# Tech steering

- Single-page web app. One HTML file, one CSS file, one JS file. No build step, no framework, no install.
- Live sync with Supabase Realtime Broadcast and Presence, the free project already used for Bloop, under the `chitchat-room-CODE` channel namespace. The key shipped is the publishable anon key.
- Vanilla JS only. If a library is needed, it must load from a CDN with no key and no account.
- Phone-first layout. Test at 360px wide. No sideways scrolling.
- `node --check` on every JS file after each change. No commit with a syntax error.
- No em dashes in user-facing text or submissions.

# Structure steering

```
.kiro/
  specs/chitchat/   requirements.md, design.md, tasks.md (Kiro spec format)
  steering/         product.md, tech.md, structure.md
  hooks/            on-save checks
  settings/         mcp.json
app/
  index.html, styles.css, app.js
tools/
  ledger-mcp/       server.mjs, ledger.json
README.md           Problem sentence first, then how it works, then Kiro usage
LICENSE             MIT
```

The `.kiro/` directory stays at the repo root and is never added to `.gitignore`. The repo is public under github.com/tydavid5/chitchat.
