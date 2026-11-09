# Tech steering

- Single-page web app. One HTML file, one CSS file, one JS file. No build step, no framework, no install.
- Live sync with Supabase Realtime Broadcast and Presence, the free project already used for Bloop, under the `chitchat-room-CODE` channel namespace. The key shipped is the publishable anon key.
- Vanilla JS only. If a library is needed, it must load from a CDN with no key and no account.
- Phone-first layout. Test at 360px wide. No sideways scrolling.
- `node --check` on every JS file after each change. No commit with a syntax error.
- No em dashes in user-facing text or submissions.
