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
