#!/usr/bin/env node
/* ChitChat ledger MCP server.
 * Stdio JSON-RPC (newline-delimited) MCP server. No dependencies.
 * Tools: ledger_add_entry, ledger_balances, ledger_settle.
 * Store: ledger.json next to this file, used by this server only.
 * The app itself does not use this server; it is for Kiro agents
 * working on the ledger, wired in .kiro/settings/mcp.json.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORE_PATH = path.join(__dirname, 'ledger.json');

function loadStore() {
  try {
    const raw = fs.readFileSync(STORE_PATH, 'utf8');
    const data = JSON.parse(raw);
    if (Array.isArray(data.entries) && Array.isArray(data.settlements)) return data;
  } catch (e) { /* missing or bad store, start fresh */ }
  return { entries: [], settlements: [] };
}

function saveStore(store) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2) + '\n', 'utf8');
}

function uid(prefix) {
  return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/* Greedy simplification: largest debtor to largest creditor. */
function simplifyDebts(net) {
  const debtors = [];
  const creditors = [];
  for (const [id, v] of Object.entries(net)) {
    if (v < -0.01) debtors.push({ id, amount: -v });
    else if (v > 0.01) creditors.push({ id, amount: v });
  }
  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);
  const debts = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const d = debtors[i];
    const c = creditors[j];
    const amt = round2(Math.min(d.amount, c.amount));
    if (amt > 0) debts.push({ from: d.id, to: c.id, amount: amt });
    d.amount = round2(d.amount - amt);
    c.amount = round2(c.amount - amt);
    if (d.amount < 0.01) i++;
    if (c.amount < 0.01) j++;
  }
  return debts;
}

function computeBalances(store) {
  const net = {};
  const ensure = (id) => { if (!(id in net)) net[id] = 0; };
  for (const e of store.entries) {
    ensure(e.payer);
    const split = e.splitAmong && e.splitAmong.length ? e.splitAmong : [e.payer];
    const share = e.amount / split.length;
    net[e.payer] = round2(net[e.payer] + e.amount);
    for (const id of split) {
      ensure(id);
      net[id] = round2(net[id] - share);
    }
  }
  for (const s of store.settlements) {
    ensure(s.from);
    ensure(s.to);
    net[s.from] = round2(net[s.from] + s.amount);
    net[s.to] = round2(net[s.to] - s.amount);
  }
  return { net, debts: simplifyDebts(net) };
}

const TOOLS = [
  {
    name: 'ledger_add_entry',
    description: 'Add one expense (a chit) to the ChitChat ledger. Demo only, pretend balances, no real money moves.',
    inputSchema: {
      type: 'object',
      properties: {
        payer: { type: 'string', description: 'Name of the member who paid' },
        amount: { type: 'number', description: 'Amount paid, as a plain number' },
        currency: { type: 'string', description: 'NGN or USD, defaults to NGN' },
        splitAmong: { type: 'array', items: { type: 'string' }, description: 'Member names sharing the cost, defaults to all known members' },
        note: { type: 'string', description: 'What the money was for' }
      },
      required: ['payer', 'amount']
    }
  },
  {
    name: 'ledger_balances',
    description: 'Show every member net balance and the simplified list of who owes whom.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'ledger_settle',
    description: 'Record that one member paid another, as a settlement. Demo only, no real money moves.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Name of the member paying' },
        to: { type: 'string', description: 'Name of the member receiving' },
        amount: { type: 'number', description: 'Amount settled' },
        currency: { type: 'string', description: 'NGN or USD, defaults to NGN' }
      },
      required: ['from', 'to', 'amount']
    }
  }
];

function toolResult(obj) {
  return { content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }] };
}

function callTool(name, args) {
  const store = loadStore();
  if (name === 'ledger_add_entry') {
    if (!args || typeof args.payer !== 'string' || !args.payer.trim()) {
      throw new Error('ledger_add_entry needs a payer name');
    }
    if (typeof args.amount !== 'number' || !(args.amount > 0)) {
      throw new Error('ledger_add_entry needs an amount greater than zero');
    }
    const entry = {
      id: uid('chit'),
      payer: args.payer.trim(),
      amount: args.amount,
      currency: args.currency || 'NGN',
      splitAmong: Array.isArray(args.splitAmong) && args.splitAmong.length ? args.splitAmong : null,
      note: typeof args.note === 'string' ? args.note : 'Expense',
      at: Date.now()
    };
    if (!entry.splitAmong) {
      const known = new Set([entry.payer]);
      for (const e of store.entries) {
        known.add(e.payer);
        (e.splitAmong || []).forEach((id) => known.add(id));
      }
      entry.splitAmong = [...known];
    }
    store.entries.push(entry);
    saveStore(store);
    return toolResult({ added: entry, balances: computeBalances(store) });
  }
  if (name === 'ledger_balances') {
    return toolResult({ balances: computeBalances(store), entries: store.entries.length, settlements: store.settlements.length });
  }
  if (name === 'ledger_settle') {
    if (!args || typeof args.from !== 'string' || typeof args.to !== 'string') {
      throw new Error('ledger_settle needs from and to names');
    }
    if (typeof args.amount !== 'number' || !(args.amount > 0)) {
      throw new Error('ledger_settle needs an amount greater than zero');
    }
    const settlement = {
      id: uid('settle'),
      from: args.from.trim(),
      to: args.to.trim(),
      amount: args.amount,
      currency: args.currency || 'NGN',
      at: Date.now()
    };
    store.settlements.push(settlement);
    saveStore(store);
    return toolResult({ recorded: settlement, balances: computeBalances(store) });
  }
  throw new Error('unknown tool: ' + name);
}

function handleMessage(msg) {
  if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0') return null;
  const id = msg.id;
  /* Notifications have no id and get no reply. */
  if (id === undefined || id === null) return null;
  try {
    if (msg.method === 'initialize') {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: msg.params && msg.params.protocolVersion ? msg.params.protocolVersion : '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'chitchat-ledger', version: '1.0.0' }
        }
      };
    }
    if (msg.method === 'ping') {
      return { jsonrpc: '2.0', id, result: {} };
    }
    if (msg.method === 'tools/list') {
      return { jsonrpc: '2.0', id, result: { tools: TOOLS } };
    }
    if (msg.method === 'tools/call') {
      const params = msg.params || {};
      return { jsonrpc: '2.0', id, result: callTool(params.name, params.arguments || {}) };
    }
    return { jsonrpc: '2.0', id, error: { code: -32601, message: 'method not found: ' + msg.method } };
  } catch (err) {
    return { jsonrpc: '2.0', id, error: { code: -32603, message: String(err && err.message ? err.message : err) } };
  }
}

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let idx;
  while ((idx = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch (e) {
      continue;
    }
    const reply = handleMessage(msg);
    if (reply) process.stdout.write(JSON.stringify(reply) + '\n');
  }
});
