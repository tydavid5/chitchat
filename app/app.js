(function () {
  'use strict';

  /* ------------------------------------------------------------------
   * Pure logic: money parser, balances, formatting.
   * These functions have no DOM or network dependencies, so they can
   * be unit tested from Node as well as used in the browser.
   * ------------------------------------------------------------------ */

  function escapeRegExp(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function round2(n) {
    return Math.round(n * 100) / 100;
  }

  /* Find the first amount in a message. Returns
   * { amount, currency, index, length } or null.
   * Currency markers: N, NGN, naira, $, USD, Naira sign.
   * A bare number only counts when it has a comma or decimal, or is
   * at least 100, so "split 4 ways" or "table 2" never become money.
   */
  function findAmount(text) {
    var re = /(₦|\$|\b(?:NGN|naira|USD|N)\b)?\s*(\d[\d,]*\.?\d*)\s*(₦|\$|\b(?:NGN|naira|USD|N)\b)?/gi;
    var m;
    while ((m = re.exec(text)) !== null) {
      var before = m[1] || '';
      var numStr = m[2];
      var after = m[3] || '';
      var value = parseFloat(numStr.replace(/,/g, ''));
      if (!isFinite(value)) continue;
      var rest = text.slice(m.index + m[0].length);
      if (/^\s*ways?\b/i.test(rest)) continue;
      var hasMarker = !!(before || after);
      var hasCommaOrDecimal = /[,\.]/.test(numStr);
      if (!hasMarker && !hasCommaOrDecimal && value < 100) continue;
      var marker = (before || after || '').toUpperCase();
      var currency = (marker === '$' || marker === 'USD') ? 'USD' : 'NGN';
      return { amount: value, currency: currency, index: m.index, length: m[0].length };
    }
    return null;
  }

  /* Payer is the sender, unless the message names another member
   * with "paid" or "covered", as in "Ada paid 5000 for lunch". */
  function findPayer(text, members, senderId) {
    for (var i = 0; i < members.length; i++) {
      var m = members[i];
      if (m.id === senderId) continue;
      var re = new RegExp('\\b' + escapeRegExp(m.name) + '\\b\\s+(paid|covered)\\b', 'i');
      if (re.test(text)) return m.id;
    }
    return senderId;
  }

  /* Split: named members plus the payer, or all members when nobody
   * is named. "for me and Ada" names Ada and the sender. A name that
   * only appears as the payer ("Ada paid ...") does not narrow the
   * split on its own; no split stated means all members. */
  function findSplit(text, members, senderId, payerId) {
    var named = [];
    for (var i = 0; i < members.length; i++) {
      var m = members[i];
      if (m.id === payerId) continue;
      var re = new RegExp('\\b' + escapeRegExp(m.name) + '\\b', 'i');
      if (re.test(text) && named.indexOf(m.id) === -1) named.push(m.id);
    }
    var mentionsMe = /\b(me|myself)\b/i.test(text);
    if (named.length > 0) {
      if (mentionsMe && named.indexOf(senderId) === -1) named.push(senderId);
      if (named.indexOf(payerId) === -1) named.push(payerId);
      return named;
    }
    if (mentionsMe) {
      var pair = [payerId];
      if (pair.indexOf(senderId) === -1) pair.push(senderId);
      return pair;
    }
    return members.map(function (m) { return m.id; });
  }

  function buildNote(text, amt) {
    var note = (text.slice(0, amt.index) + ' ' + text.slice(amt.index + amt.length)).replace(/\s+/g, ' ').trim();
    note = note.replace(/^(i\s+)?(paid|covered)\s+/i, '');
    note = note.replace(/\s+split\s+\d*\s*ways?\.?$/i, '');
    note = note.replace(/^(for|on)\s+/i, '');
    note = note.trim();
    return note || 'Expense';
  }

  /* Parse a chat message into a draft chit, or null when the message
   * has no money in it. Pattern-based, not magic. */
  function parseMoneyMessage(text, members, senderId) {
    if (!text || !members || members.length === 0) return null;
    var amt = findAmount(text);
    if (!amt) return null;
    var payerId = findPayer(text, members, senderId);
    var splitAmong = findSplit(text, members, senderId, payerId);
    return {
      payerId: payerId,
      amount: amt.amount,
      currency: amt.currency,
      splitAmong: splitAmong,
      note: buildNote(text, amt)
    };
  }

  /* Greedy simplification: match the largest debtor to the largest
   * creditor until nothing is left. Gives the smallest practical set
   * of payments. */
  function simplifyDebts(net) {
    var debtors = [];
    var creditors = [];
    Object.keys(net).forEach(function (id) {
      var v = net[id];
      if (v < -0.01) debtors.push({ id: id, amount: -v });
      else if (v > 0.01) creditors.push({ id: id, amount: v });
    });
    debtors.sort(function (a, b) { return b.amount - a.amount; });
    creditors.sort(function (a, b) { return b.amount - a.amount; });
    var debts = [];
    var i = 0;
    var j = 0;
    while (i < debtors.length && j < creditors.length) {
      var d = debtors[i];
      var c = creditors[j];
      var amt = round2(Math.min(d.amount, c.amount));
      if (amt > 0) debts.push({ fromId: d.id, toId: c.id, amount: amt });
      d.amount = round2(d.amount - amt);
      c.amount = round2(c.amount - amt);
      if (d.amount < 0.01) i++;
      if (c.amount < 0.01) j++;
    }
    return debts;
  }

  /* Balances per currency. Returns { NGN: { net, debts }, USD: ... }.
   * net[id] is positive when the room owes that member. */
  function computeBalances(chits, settlements, memberIds) {
    var result = {};
    function ensure(cur) {
      if (!result[cur]) {
        result[cur] = { currency: cur, net: {}, debts: [] };
        memberIds.forEach(function (id) { result[cur].net[id] = 0; });
      }
      return result[cur];
    }
    (chits || []).forEach(function (c) {
      var b = ensure(c.currency || 'NGN');
      var share = c.amount / Math.max(1, (c.splitAmong || []).length);
      b.net[c.payerId] = round2((b.net[c.payerId] || 0) + c.amount);
      (c.splitAmong || []).forEach(function (id) {
        b.net[id] = round2((b.net[id] || 0) - share);
      });
    });
    (settlements || []).forEach(function (s) {
      var b = ensure(s.currency || 'NGN');
      b.net[s.fromId] = round2((b.net[s.fromId] || 0) + s.amount);
      b.net[s.toId] = round2((b.net[s.toId] || 0) - s.amount);
    });
    Object.keys(result).forEach(function (cur) {
      result[cur].debts = simplifyDebts(result[cur].net);
    });
    return result;
  }

  function formatMoney(amount, currency) {
    var sign = currency === 'USD' ? '$' : '₦';
    var abs = Math.abs(amount);
    var str = abs.toLocaleString('en-US', {
      minimumFractionDigits: (abs % 1 === 0 ? 0 : 2),
      maximumFractionDigits: 2
    });
    return (amount < 0 ? '-' : '') + sign + str;
  }

  function uid(prefix) {
    return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  /* Expose the pure functions for Node unit tests. In the browser
   * this block does nothing. */
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      parseMoneyMessage: parseMoneyMessage,
      findAmount: findAmount,
      computeBalances: computeBalances,
      simplifyDebts: simplifyDebts,
      formatMoney: formatMoney
    };
  }

  /* The rest of this file only runs in a browser. */
  if (typeof document === 'undefined') return;

  /* ------------------------------------------------------------------
   * Browser app
   * ------------------------------------------------------------------ */

  var SUPABASE_URL = 'https://obxfkslspfovsplmliac.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_mvOBBaOvg1QnONjLwe7zrQ_VZEYNKO8';

  var $ = function (id) { return document.getElementById(id); };

  /* Device identity: one stable id and one display name per device. */
  var deviceId = localStorage.getItem('chitchat-device-id');
  if (!deviceId) {
    deviceId = uid('dev');
    localStorage.setItem('chitchat-device-id', deviceId);
  }
  var displayName = localStorage.getItem('chitchat-display-name') || '';

  var sb = null;
  var channel = null;
  var roomCode = null;
  var myName = '';

  var messages = [];
  var chits = [];
  var settlements = [];
  var members = {};       /* id -> { id, name, present, graceUntil } */
  var graceTimers = {};   /* id -> timeout */
  var typingMap = {};     /* senderId -> { name, at } */
  var lastTypingSent = 0;
  var draft = null;       /* local draft chit, payer only, never synced */
  var editingChitId = null;

  var GRACE_MS = 10000;

  /* ---------- helpers ---------- */

  function memberName(id) {
    if (id === deviceId) return myName || displayName || 'You';
    if (members[id]) return members[id].name;
    return 'Someone';
  }

  function allMemberIds() {
    var ids = {};
    Object.keys(members).forEach(function (id) { ids[id] = true; });
    chits.forEach(function (c) {
      ids[c.payerId] = true;
      (c.splitAmong || []).forEach(function (id) { ids[id] = true; });
    });
    settlements.forEach(function (s) { ids[s.fromId] = true; ids[s.toId] = true; });
    messages.forEach(function (m) { ids[m.senderId] = true; });
    return Object.keys(ids);
  }

  function memberList() {
    return allMemberIds().map(function (id) {
      return { id: id, name: memberName(id) };
    });
  }

  function saveLocal() {
    if (!roomCode) return;
    try {
      localStorage.setItem('chitchat-room-' + roomCode, JSON.stringify({
        messages: messages.slice(-200),
        chits: chits,
        settlements: settlements
      }));
    } catch (e) { /* storage full or unavailable, live sync still works */ }
  }

  function loadLocal() {
    if (!roomCode) return;
    try {
      var raw = localStorage.getItem('chitchat-room-' + roomCode);
      if (!raw) return;
      var data = JSON.parse(raw);
      messages = data.messages || [];
      chits = data.chits || [];
      settlements = data.settlements || [];
    } catch (e) { /* ignore a bad cache */ }
  }

  function toast(text) {
    var el = $('toast');
    el.textContent = text;
    el.classList.remove('hidden');
    setTimeout(function () { el.classList.add('hidden'); }, 2500);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function timeAgo(ts) {
    var diff = Date.now() - ts;
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
    return new Date(ts).toLocaleDateString();
  }

  /* ---------- views ---------- */

  function showJoin() {
    $('join-screen').classList.remove('hidden');
    $('room-screen').classList.add('hidden');
    $('name-input').value = displayName;
  }

  function showRoom() {
    $('join-screen').classList.add('hidden');
    $('room-screen').classList.remove('hidden');
    $('room-code-label').textContent = roomCode;
    renderAll();
  }

  function switchTab(tab) {
    ['chat', 'ledger', 'balances'].forEach(function (t) {
      $('tab-' + t).classList.toggle('hidden', t !== tab);
      $('tabbtn-' + t).classList.toggle('active', t === tab);
    });
    if (tab === 'ledger') { renderLedger(); requestSync(); }
    if (tab === 'balances') { renderBalances(); requestSync(); }
  }

  function renderAll() {
    renderMembers();
    renderMessages();
    renderLedger();
    renderBalances();
    renderDraft();
  }

  function renderMembers() {
    var wrap = $('member-list');
    var ids = Object.keys(members);
    if (ids.length === 0) {
      wrap.innerHTML = '<span class="member-chip">Just you so far. Share the link to invite friends.</span>';
      return;
    }
    wrap.innerHTML = ids.map(function (id) {
      var m = members[id];
      var away = m.graceUntil ? ' <span class="away">(away)</span>' : '';
      var you = id === deviceId ? ' (you)' : '';
      return '<span class="member-chip">' + esc(m.name) + you + away + '</span>';
    }).join('');
  }

  function renderMessages() {
    var wrap = $('message-list');
    var nearBottom = wrap.scrollHeight - wrap.scrollTop - wrap.clientHeight < 80;
    if (messages.length === 0) {
      wrap.innerHTML = '<p class="empty-note">No messages yet. Say hello, then try "I paid 12,000 for dinner split 4 ways".</p>';
      return;
    }
    wrap.innerHTML = messages.map(function (m) {
      var mine = m.senderId === deviceId;
      return '<div class="msg' + (mine ? ' mine' : '') + '">' +
        '<div class="msg-name">' + esc(m.senderName) + '</div>' +
        '<div class="msg-text">' + esc(m.text) + '</div>' +
        '<div class="msg-time">' + timeAgo(m.at) + '</div>' +
        '</div>';
    }).join('');
    if (nearBottom) wrap.scrollTop = wrap.scrollHeight;
  }

  function renderTyping() {
    var now = Date.now();
    var names = Object.keys(typingMap).filter(function (id) {
      return id !== deviceId && now - typingMap[id].at < 5000;
    }).map(function (id) { return typingMap[id].name; });
    var el = $('typing-indicator');
    el.textContent = names.length ? names.join(', ') + (names.length === 1 ? ' is typing...' : ' are typing...') : '';
  }

  function renderDraft() {
    var card = $('draft-card');
    if (!draft) {
      card.classList.add('hidden');
      card.innerHTML = '';
      return;
    }
    var splitNames = draft.splitAmong.map(function (id) { return memberName(id); }).join(', ');
    card.classList.remove('hidden');
    card.innerHTML =
      '<div class="draft-title">Draft chit, only you can see this</div>' +
      '<div class="draft-line"><strong>' + esc(memberName(draft.payerId)) + '</strong> paid <strong>' +
      esc(formatMoney(draft.amount, draft.currency)) + '</strong></div>' +
      '<div class="draft-line">Split among: ' + esc(splitNames) + '</div>' +
      '<div class="draft-line">Note: ' + esc(draft.note) + '</div>' +
      '<div class="draft-actions">' +
      '<button class="btn primary" id="draft-confirm">Confirm</button>' +
      '<button class="btn" id="draft-edit">Edit</button>' +
      '<button class="btn danger-text" id="draft-dismiss">Dismiss</button>' +
      '</div>';
    $('draft-confirm').onclick = confirmDraft;
    $('draft-edit').onclick = function () { openExpenseForm(draft); };
    $('draft-dismiss').onclick = function () { draft = null; renderDraft(); };
  }

  /* ---------- ledger and balances ---------- */

  function renderLedger() {
    var wrap = $('ledger-list');
    var items = [];
    chits.forEach(function (c) {
      items.push({ kind: 'chit', at: c.at, data: c });
    });
    settlements.forEach(function (s) {
      items.push({ kind: 'settlement', at: s.at, data: s });
    });
    items.sort(function (a, b) { return b.at - a.at; });
    if (items.length === 0) {
      wrap.innerHTML = '<p class="empty-note">No expenses yet. Confirm a draft chit or tap Add expense.</p>';
      return;
    }
    wrap.innerHTML = items.map(function (it) {
      if (it.kind === 'chit') {
        var c = it.data;
        var splitNames = (c.splitAmong || []).map(function (id) { return memberName(id); }).join(', ');
        var mine = c.payerId === deviceId;
        var actions = mine
          ? '<div class="ledger-actions"><button class="btn small" data-edit="' + c.id + '">Edit</button>' +
            '<button class="btn small danger-text" data-del="' + c.id + '">Delete</button></div>'
          : '';
        return '<div class="ledger-item">' +
          '<div class="ledger-main"><strong>' + esc(memberName(c.payerId)) + '</strong> paid <strong>' +
          esc(formatMoney(c.amount, c.currency)) + '</strong><br>' +
          '<span class="ledger-note">' + esc(c.note) + '</span><br>' +
          '<span class="ledger-meta">Split among ' + esc(splitNames) + ' &middot; ' + timeAgo(c.at) + '</span></div>' +
          actions + '</div>';
      }
      var s = it.data;
      return '<div class="ledger-item settlement">' +
        '<div class="ledger-main"><strong>' + esc(memberName(s.fromId)) + '</strong> paid <strong>' +
        esc(memberName(s.toId)) + '</strong> ' + esc(formatMoney(s.amount, s.currency)) +
        ' <span class="settlement-tag">settlement, no real money moved</span><br>' +
        '<span class="ledger-meta">' + timeAgo(s.at) + '</span></div>' +
        '<div class="ledger-actions"><button class="btn small" data-undo-settle="' + s.id + '">Undo</button></div>' +
        '</div>';
    }).join('');
    wrap.querySelectorAll('[data-edit]').forEach(function (btn) {
      btn.onclick = function () {
        var c = chits.find(function (x) { return x.id === btn.getAttribute('data-edit'); });
        if (c) openExpenseForm(c);
      };
    });
    wrap.querySelectorAll('[data-del]').forEach(function (btn) {
      btn.onclick = function () {
        if (!window.confirm('Delete this chit? The balance board updates for everyone.')) return;
        deleteChit(btn.getAttribute('data-del'));
      };
    });
    wrap.querySelectorAll('[data-undo-settle]').forEach(function (btn) {
      btn.onclick = function () { undoSettlement(btn.getAttribute('data-undo-settle')); };
    });
  }

  function renderBalances() {
    var wrap = $('balance-board');
    var ids = allMemberIds();
    var balances = computeBalances(chits, settlements, ids);
    var currencies = Object.keys(balances);
    if (currencies.length === 0) {
      wrap.innerHTML = '<p class="empty-note">No expenses yet. Balances appear here once someone confirms a chit.</p>';
      return;
    }
    var html = '';
    currencies.forEach(function (cur) {
      var b = balances[cur];
      html += '<div class="balance-currency">' + esc(cur === 'USD' ? 'Dollars' : 'Naira') + '</div>';
      html += '<div class="net-list">' + ids.map(function (id) {
        var v = b.net[id] || 0;
        var cls = v > 0.01 ? 'owed' : (v < -0.01 ? 'owes' : 'settled');
        var label = v > 0.01 ? 'is owed ' + formatMoney(v, cur)
          : (v < -0.01 ? 'owes ' + formatMoney(-v, cur) : 'settled');
        return '<div class="net-row ' + cls + '"><span>' + esc(memberName(id)) + '</span><span>' + esc(label) + '</span></div>';
      }).join('') + '</div>';
      if (b.debts.length === 0) {
        html += '<div class="settled-banner">Fully settled. Nobody owes anybody.</div>';
      } else {
        html += '<div class="debt-list">' + b.debts.map(function (d) {
          return '<div class="debt-row"><span><strong>' + esc(memberName(d.fromId)) + '</strong> owes <strong>' +
            esc(memberName(d.toId)) + '</strong> ' + esc(formatMoney(d.amount, cur)) + '</span>' +
            '<button class="btn primary small" data-settle="' + d.fromId + '|' + d.toId + '|' + d.amount + '|' + cur + '">Settle</button></div>';
        }).join('') + '</div>';
      }
    });
    wrap.innerHTML = html;
    wrap.querySelectorAll('[data-settle]').forEach(function (btn) {
      btn.onclick = function () {
        var parts = btn.getAttribute('data-settle').split('|');
        recordSettlement(parts[0], parts[1], parseFloat(parts[2]), parts[3]);
      };
    });
  }

  /* ---------- live sync ---------- */

  function broadcast(event, payload) {
    if (!channel) return;
    channel.send({ type: 'broadcast', event: event, payload: payload }).catch(function () { /* offline, local copy stays */ });
  }

  /* Ask everyone in the room for their full state. Each peer answers with a
     sync-state, which mergeState folds in by id. This is the recovery path
     when a live broadcast is missed (backgrounded tab, flaky mobile link):
     broadcasts are fire-and-forget, so a client that missed one must be able
     to pull the current state instead of waiting for the next event. */
  function requestSync() {
    if (!channel || !roomCode) return;
    broadcast('sync-request', { from: deviceId });
  }

  function mergeState(data) {
    var byId = {};
    messages.forEach(function (m) { byId[m.id] = m; });
    (data.messages || []).forEach(function (m) { if (!byId[m.id]) byId[m.id] = m; });
    messages = Object.keys(byId).map(function (id) { return byId[id]; }).sort(function (a, b) { return a.at - b.at; });
    var chitById = {};
    chits.forEach(function (c) { chitById[c.id] = c; });
    (data.chits || []).forEach(function (c) {
      if (!chitById[c.id] || (c.updatedAt || 0) > (chitById[c.id].updatedAt || 0)) chitById[c.id] = c;
    });
    chits = Object.keys(chitById).map(function (id) { return chitById[id]; });
    var setById = {};
    settlements.forEach(function (s) { setById[s.id] = s; });
    (data.settlements || []).forEach(function (s) { if (!setById[s.id]) setById[s.id] = s; });
    settlements = Object.keys(setById).map(function (id) { return setById[id]; });
    (data.messages || []).forEach(function (m) {
      if (!members[m.senderId]) members[m.senderId] = { id: m.senderId, name: m.senderName, present: false };
    });
    saveLocal();
    renderAll();
  }

  function handlePresence() {
    if (!channel) return;
    var state = channel.presenceState();
    var presentIds = {};
    Object.keys(state).forEach(function (key) {
      var presences = state[key];
      if (!presences || !presences.length) return;
      presentIds[key] = true;
      if (graceTimers[key]) { clearTimeout(graceTimers[key]); delete graceTimers[key]; }
      members[key] = { id: key, name: presences[0].name || 'Someone', present: true };
    });
    /* 10-second grace: a vanished member stays listed as away, then is pruned. */
    Object.keys(members).forEach(function (id) {
      if (presentIds[id] || graceTimers[id]) return;
      members[id].present = false;
      members[id].graceUntil = Date.now() + GRACE_MS;
      graceTimers[id] = setTimeout(function () {
        delete graceTimers[id];
        delete members[id].graceUntil;
        delete members[id];
        renderMembers();
        renderBalances();
      }, GRACE_MS);
    });
    renderMembers();
  }

  function joinRoom(code) {
    roomCode = code.toUpperCase();
    myName = displayName;
    loadLocal();
    showRoom();
    history.replaceState(null, '', location.pathname + '?room=' + roomCode);
    try { localStorage.setItem('chitchat-last-room', roomCode); } catch (e) { /* ignore */ }

    if (!sb) {
      $('conn-note').textContent = 'Could not reach the live service. Your messages stay on this device only.';
      return;
    }
    if (channel) { channel.unsubscribe(); channel = null; }
    channel = sb.channel('chitchat-room-' + roomCode, {
      config: { broadcast: { self: false }, presence: { key: deviceId } }
    });
    channel
      .on('broadcast', { event: 'message' }, function (msg) {
        var m = msg.payload;
        if (!m || messages.some(function (x) { return x.id === m.id; })) return;
        messages.push(m);
        if (!members[m.senderId]) members[m.senderId] = { id: m.senderId, name: m.senderName, present: false };
        saveLocal();
        renderMessages();
      })
      .on('broadcast', { event: 'chit' }, function (msg) {
        var c = msg.payload;
        if (!c || chits.some(function (x) { return x.id === c.id; })) return;
        chits.push(c);
        saveLocal();
        renderLedger();
        renderBalances();
        toast(memberName(c.payerId) + ' added ' + formatMoney(c.amount, c.currency) + ' to the ledger');
      })
      .on('broadcast', { event: 'chit-edit' }, function (msg) {
        var c = msg.payload;
        if (!c) return;
        var i = chits.findIndex(function (x) { return x.id === c.id; });
        if (i >= 0) chits[i] = c; else chits.push(c);
        saveLocal();
        renderLedger();
        renderBalances();
      })
      .on('broadcast', { event: 'chit-delete' }, function (msg) {
        var id = msg.payload && msg.payload.id;
        if (!id) return;
        chits = chits.filter(function (x) { return x.id !== id; });
        saveLocal();
        renderLedger();
        renderBalances();
      })
      .on('broadcast', { event: 'settle' }, function (msg) {
        var s = msg.payload;
        if (!s || settlements.some(function (x) { return x.id === s.id; })) return;
        settlements.push(s);
        saveLocal();
        renderLedger();
        renderBalances();
      })
      .on('broadcast', { event: 'settle-undo' }, function (msg) {
        var id = msg.payload && msg.payload.id;
        if (!id) return;
        settlements = settlements.filter(function (x) { return x.id !== id; });
        saveLocal();
        renderLedger();
        renderBalances();
      })
      .on('broadcast', { event: 'typing' }, function (msg) {
        var p = msg.payload;
        if (!p || p.senderId === deviceId) return;
        typingMap[p.senderId] = { name: p.senderName, at: Date.now() };
        renderTyping();
      })
      .on('broadcast', { event: 'sync-request' }, function (msg) {
        var p = msg.payload;
        if (!p || p.from === deviceId) return;
        broadcast('sync-state', { to: p.from, messages: messages, chits: chits, settlements: settlements });
      })
      .on('broadcast', { event: 'sync-state' }, function (msg) {
        var p = msg.payload;
        if (!p || p.to !== deviceId) return;
        /* Accept every sync-state, not just the first. mergeState dedupes by
           id and keeps the newest updatedAt, so a late or repeated state can
           only fill gaps, never duplicate or roll back. */
        mergeState(p);
      })
      .on('presence', { event: 'sync' }, handlePresence)
      .subscribe(function (status) {
        if (status === 'SUBSCRIBED') {
          channel.track({ name: myName });
          broadcast('sync-request', { from: deviceId });
          $('conn-note').textContent = 'Live. Messages sync to everyone in this room.';
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          $('conn-note').textContent = 'Live sync is having trouble. Your messages stay on this device and retry when the connection returns.';
        }
      });
  }

  function leaveRoom() {
    if (channel) { channel.unsubscribe(); channel = null; }
    roomCode = null;
    messages = [];
    chits = [];
    settlements = [];
    members = {};
    draft = null;
    history.replaceState(null, '', location.pathname);
    showJoin();
  }

  /* ---------- chat, drafts, expenses, settle ---------- */

  function sendMessage() {
    var input = $('message-input');
    var text = input.value.trim();
    if (!text) return;
    var m = {
      id: uid('msg'),
      roomCode: roomCode,
      senderId: deviceId,
      senderName: myName,
      text: text,
      at: Date.now()
    };
    messages.push(m);
    saveLocal();
    renderMessages();
    broadcast('message', m);
    broadcast('typing', { senderId: deviceId, senderName: myName, stopped: true });
    input.value = '';
    input.focus();
    var parsed = parseMoneyMessage(text, memberList(), deviceId);
    if (parsed) {
      draft = parsed;
      renderDraft();
      toast('Draft chit ready. Confirm it, edit it, or dismiss it.');
    }
  }

  function confirmDraft() {
    if (!draft) return;
    var c = {
      id: uid('chit'),
      roomCode: roomCode,
      payerId: draft.payerId,
      payerName: memberName(draft.payerId),
      amount: draft.amount,
      currency: draft.currency,
      splitAmong: draft.splitAmong,
      note: draft.note,
      at: Date.now(),
      updatedAt: Date.now(),
      by: 'parser'
    };
    chits.push(c);
    saveLocal();
    draft = null;
    renderDraft();
    renderLedger();
    renderBalances();
    broadcast('chit', c);
    toast('Added to the ledger.');
  }

  function deleteChit(id) {
    chits = chits.filter(function (x) { return x.id !== id; });
    saveLocal();
    renderLedger();
    renderBalances();
    broadcast('chit-delete', { id: id });
  }

  function recordSettlement(fromId, toId, amount, currency) {
    var s = {
      id: uid('settle'),
      roomCode: roomCode,
      fromId: fromId,
      toId: toId,
      amount: amount,
      currency: currency,
      at: Date.now()
    };
    settlements.push(s);
    saveLocal();
    renderLedger();
    renderBalances();
    broadcast('settle', s);
    toast('Settlement recorded. No real money moved.');
  }

  function undoSettlement(id) {
    settlements = settlements.filter(function (x) { return x.id !== id; });
    saveLocal();
    renderLedger();
    renderBalances();
    broadcast('settle-undo', { id: id });
    toast('Settlement undone.');
  }

  /* ---------- expense form ---------- */

  function openExpenseForm(prefill) {
    editingChitId = (prefill && prefill.id) ? prefill.id : null;
    var form = $('expense-form');
    form.classList.remove('hidden');
    $('expense-amount').value = prefill ? prefill.amount : '';
    $('expense-currency').value = prefill ? (prefill.currency || 'NGN') : 'NGN';
    $('expense-note').value = prefill ? prefill.note : '';
    $('expense-payer').innerHTML = memberList().map(function (m) {
      return '<option value="' + esc(m.id) + '"' + (prefill && prefill.payerId === m.id ? ' selected' : '') + '>' + esc(m.name) + '</option>';
    }).join('');
    if (!prefill) $('expense-payer').value = deviceId;
    var splitWrap = $('expense-split');
    var chosen = prefill ? prefill.splitAmong : memberList().map(function (m) { return m.id; });
    splitWrap.innerHTML = memberList().map(function (m) {
      var checked = chosen.indexOf(m.id) !== -1 ? ' checked' : '';
      return '<label class="split-check"><input type="checkbox" value="' + esc(m.id) + '"' + checked + '> ' + esc(m.name) + '</label>';
    }).join('');
    $('expense-title').textContent = editingChitId ? 'Edit expense' : 'Add expense';
    $('expense-amount').focus();
  }

  function closeExpenseForm() {
    $('expense-form').classList.add('hidden');
    editingChitId = null;
    if (draft) renderDraft();
  }

  function saveExpenseForm() {
    var amount = parseFloat(String($('expense-amount').value).replace(/,/g, ''));
    if (!isFinite(amount) || amount <= 0) {
      toast('Enter an amount greater than zero.');
      return;
    }
    var splitAmong = Array.prototype.slice.call($('expense-split').querySelectorAll('input:checked')).map(function (el) { return el.value; });
    if (splitAmong.length === 0) {
      toast('Pick at least one person to split with.');
      return;
    }
    var note = $('expense-note').value.trim() || 'Expense';
    var payerId = $('expense-payer').value;
    var currency = $('expense-currency').value;
    if (editingChitId) {
      var c = chits.find(function (x) { return x.id === editingChitId; });
      if (c) {
        c.amount = amount;
        c.currency = currency;
        c.note = note;
        c.payerId = payerId;
        c.payerName = memberName(payerId);
        c.splitAmong = splitAmong;
        c.updatedAt = Date.now();
        saveLocal();
        renderLedger();
        renderBalances();
        broadcast('chit-edit', c);
        toast('Expense updated.');
      }
    } else {
      var fresh = {
        id: uid('chit'),
        roomCode: roomCode,
        payerId: payerId,
        payerName: memberName(payerId),
        amount: amount,
        currency: currency,
        splitAmong: splitAmong,
        note: note,
        at: Date.now(),
        updatedAt: Date.now(),
        by: 'manual'
      };
      chits.push(fresh);
      saveLocal();
      renderLedger();
      renderBalances();
      broadcast('chit', fresh);
      toast('Added to the ledger.');
    }
    draft = null;
    closeExpenseForm();
  }

  /* ---------- share, join, init ---------- */

  function shareLink() {
    var url = location.origin + location.pathname + '?room=' + roomCode;
    function done() { toast('Room link copied. Send it to your friends.'); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done, function () { fallbackCopy(url); done(); });
    } else {
      fallbackCopy(url);
      done();
    }
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) { /* clipboard unavailable */ }
    document.body.removeChild(ta);
  }

  function randomCode() {
    var letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    var code = '';
    for (var i = 0; i < 4; i++) code += letters[Math.floor(Math.random() * letters.length)];
    return code;
  }

  function doCreate() {
    var name = $('name-input').value.trim();
    if (!name) { toast('Enter a display name first.'); $('name-input').focus(); return; }
    displayName = name;
    localStorage.setItem('chitchat-display-name', name);
    joinRoom(randomCode());
  }

  function doJoin() {
    var name = $('name-input').value.trim();
    var code = $('code-input').value.trim().toUpperCase();
    if (!name) { toast('Enter a display name first.'); $('name-input').focus(); return; }
    if (!/^[A-Z]{4}$/.test(code)) { toast('Enter the 4-letter room code.'); $('code-input').focus(); return; }
    displayName = name;
    localStorage.setItem('chitchat-display-name', name);
    joinRoom(code);
  }

  function init() {
    if (window.supabase && window.supabase.createClient) {
      try {
        sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
          auth: { persistSession: false, autoRefreshToken: false }
        });
      } catch (e) { sb = null; }
    }

    $('create-btn').onclick = doCreate;
    $('join-btn').onclick = doJoin;
    $('leave-btn').onclick = leaveRoom;
    $('share-btn').onclick = shareLink;
    $('send-btn').onclick = sendMessage;
    $('message-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); sendMessage(); }
    });
    $('message-input').addEventListener('input', function () {
      var now = Date.now();
      if (now - lastTypingSent > 2500) {
        lastTypingSent = now;
        broadcast('typing', { senderId: deviceId, senderName: myName });
      }
    });
    $('message-input').addEventListener('blur', function () {
      broadcast('typing', { senderId: deviceId, senderName: myName, stopped: true });
    });
    $('tabbtn-chat').onclick = function () { switchTab('chat'); };
    $('tabbtn-ledger').onclick = function () { switchTab('ledger'); };
    $('tabbtn-balances').onclick = function () { switchTab('balances'); };
    $('add-expense-btn').onclick = function () { openExpenseForm(null); };
    $('expense-save').onclick = saveExpenseForm;
    $('expense-cancel').onclick = closeExpenseForm;
    $('name-input').addEventListener('change', function () {
      displayName = $('name-input').value.trim();
      localStorage.setItem('chitchat-display-name', displayName);
    });
    setInterval(renderTyping, 2000);

    /* Pull the room state again whenever this client might have missed a
       live broadcast: coming back to the tab, switching back to the window,
       and a slow heartbeat while in a room. */
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') requestSync();
    });
    window.addEventListener('focus', requestSync);
    setInterval(requestSync, 20000);

    /* Join by link: ?room=CODE. Auto-join when a name is already saved. */
    var params = new URLSearchParams(location.search);
    var codeParam = (params.get('room') || '').toUpperCase();
    if (/^[A-Z]{4}$/.test(codeParam)) {
      $('code-input').value = codeParam;
      if (displayName) {
        joinRoom(codeParam);
        return;
      }
    }
    showJoin();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
