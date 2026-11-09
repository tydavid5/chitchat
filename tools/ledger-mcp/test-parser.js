/* ChitChat parser and balance checks.
 *
 * Runs the pure logic straight out of app/app.js (no DOM, no network):
 * the test slices the pure-logic section out of app.js and evaluates it,
 * so these checks always run against the shipped code.
 *
 * Run: node tools/ledger-mcp/test-parser.js
 */
'use strict';

var fs = require('fs');
var path = require('path');
var assert = require('assert');

var appPath = path.join(__dirname, '..', '..', 'app', 'app.js');
var src = fs.readFileSync(appPath, 'utf8');
var start = src.indexOf('Pure logic: money parser');
var end = src.indexOf('The rest of this file only runs in a browser.');
if (start < 0 || end < 0 || end <= start) {
  throw new Error('Could not find the pure-logic section in app.js');
}
var pure = src.slice(src.lastIndexOf('/*', start), src.lastIndexOf('/*', end));
var fakeModule = { exports: {} };
new Function('module', pure)(fakeModule);
var lib = fakeModule.exports;
var parse = lib.parseMoneyMessage;
var balances = lib.computeBalances;
var simplify = lib.simplifyDebts;
var money = lib.formatMoney;

var members = [
  { id: 'five', name: 'Five' },
  { id: 'ada', name: 'Ada' },
  { id: 'bola', name: 'Bola' }
];

var passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log('ok - ' + name);
}

/* ---------- parser ---------- */

check('Ada paid 5000 names Ada as payer', function () {
  var d = parse('Ada paid 5000', members, 'five');
  assert.strictEqual(d.payerId, 'ada');
  assert.strictEqual(d.amount, 5000);
  assert.strictEqual(d.currency, 'NGN');
});

check('see you at 5 has no money in it', function () {
  assert.strictEqual(parse('see you at 5', members, 'five'), null);
});

check('Naira sign with comma parses 7500', function () {
  var d = parse('Lunch was ₦7,500', members, 'five');
  assert.strictEqual(d.amount, 7500);
  assert.strictEqual(d.currency, 'NGN');
});

check('Bola covered 3000 names Bola as payer', function () {
  var d = parse('Bola covered 3000', members, 'five');
  assert.strictEqual(d.payerId, 'bola');
  assert.strictEqual(d.amount, 3000);
});

check('12,000 dinner split 4 ways keeps dinner as the note', function () {
  var d = parse('I paid 12,000 for dinner split 4 ways', members, 'five');
  assert.strictEqual(d.amount, 12000);
  assert.strictEqual(d.note, 'dinner');
});

check('12,000 dinner split 2 ways parses', function () {
  var d = parse('I paid 12,000 for dinner split 2 ways', members, 'five');
  assert.strictEqual(d.amount, 12000);
  assert.strictEqual(d.currency, 'NGN');
  assert.deepStrictEqual(d.splitAmong, ['five', 'ada', 'bola']);
});

check('$25 is USD', function () {
  var d = parse('$25 for taxi', members, 'five');
  assert.strictEqual(d.amount, 25);
  assert.strictEqual(d.currency, 'USD');
});

check('500 NGN parses', function () {
  var d = parse('paid 500 NGN for lunch', members, 'five');
  assert.strictEqual(d.amount, 500);
  assert.strictEqual(d.currency, 'NGN');
});

check('split 4 ways on its own is not money', function () {
  assert.strictEqual(parse('split 4 ways', members, 'five'), null);
});

check('table 2 is not money', function () {
  assert.strictEqual(parse('table 2', members, 'five'), null);
});

check('decimal amount parses', function () {
  var d = parse('I paid 1,500.50 for cake', members, 'five');
  assert.strictEqual(d.amount, 1500.5);
});

check('Ada paid 5000 for lunch splits among everyone', function () {
  var d = parse('Ada paid 5000 for lunch', members, 'five');
  assert.strictEqual(d.payerId, 'ada');
  assert.deepStrictEqual(d.splitAmong, ['five', 'ada', 'bola']);
});

check('for me and Ada splits between the two', function () {
  var d = parse('I paid 8000 for me and Ada', members, 'five');
  assert.strictEqual(d.payerId, 'five');
  assert.deepStrictEqual(d.splitAmong, ['ada', 'five']);
});

check('bare 100 counts as money', function () {
  var d = parse('100', members, 'five');
  assert.strictEqual(d.amount, 100);
});

check('bare 99 does not count as money', function () {
  assert.strictEqual(parse('99', members, 'five'), null);
});

check('N5000 parses as 5000 naira', function () {
  var d = parse('N5000', members, 'five');
  assert.strictEqual(d.amount, 5000);
  assert.strictEqual(d.currency, 'NGN');
});

check('USD 200 parses as dollars', function () {
  var d = parse('USD 200', members, 'five');
  assert.strictEqual(d.amount, 200);
  assert.strictEqual(d.currency, 'USD');
});

/* ---------- balances ---------- */

function chit(payerId, amount, splitAmong, currency) {
  return {
    id: 'chit-' + payerId + '-' + amount,
    payerId: payerId,
    amount: amount,
    currency: currency || 'NGN',
    splitAmong: splitAmong,
    note: 'test',
    at: 1
  };
}

check('one 12,000 chit split 2 ways leaves Ada owing Five 6,000', function () {
  var b = balances([chit('five', 12000, ['five', 'ada'])], [], ['five', 'ada']);
  assert.strictEqual(b.NGN.net.five, 6000);
  assert.strictEqual(b.NGN.net.ada, -6000);
  assert.deepStrictEqual(b.NGN.debts, [{ fromId: 'ada', toId: 'five', amount: 6000 }]);
});

check('settling the 6,000 clears the debt', function () {
  var b = balances(
    [chit('five', 12000, ['five', 'ada'])],
    [{ id: 's1', fromId: 'ada', toId: 'five', amount: 6000, currency: 'NGN', at: 2 }],
    ['five', 'ada']
  );
  assert.strictEqual(b.NGN.net.five, 0);
  assert.strictEqual(b.NGN.net.ada, 0);
  assert.deepStrictEqual(b.NGN.debts, []);
});

check('two chits net out to Ada owing Five 4,000', function () {
  var b = balances(
    [chit('five', 12000, ['five', 'ada']), chit('ada', 4000, ['five', 'ada'])],
    [],
    ['five', 'ada']
  );
  assert.strictEqual(b.NGN.net.five, 4000);
  assert.strictEqual(b.NGN.net.ada, -4000);
  assert.deepStrictEqual(b.NGN.debts, [{ fromId: 'ada', toId: 'five', amount: 4000 }]);
});

check('three-way split gives two debts to the payer', function () {
  var b = balances([chit('five', 9000, ['five', 'ada', 'bola'])], [], ['five', 'ada', 'bola']);
  assert.strictEqual(b.NGN.net.five, 6000);
  assert.strictEqual(b.NGN.net.ada, -3000);
  assert.strictEqual(b.NGN.net.bola, -3000);
  assert.strictEqual(b.NGN.debts.length, 2);
});

check('greedy simplification keeps the fewest payments', function () {
  var b = balances([chit('five', 15000, ['five', 'ada', 'bola'])], [], ['five', 'ada', 'bola']);
  assert.strictEqual(b.NGN.debts.length, 2);
  assert.deepStrictEqual(b.NGN.debts, [
    { fromId: 'ada', toId: 'five', amount: 5000 },
    { fromId: 'bola', toId: 'five', amount: 5000 }
  ]);
});

check('USD chits stay in their own currency', function () {
  var b = balances([chit('five', 100, ['five', 'ada'], 'USD')], [], ['five', 'ada']);
  assert.ok(b.USD);
  assert.strictEqual(b.NGN, undefined);
  assert.strictEqual(b.USD.net.five, 50);
});

check('no chits means no balances', function () {
  assert.deepStrictEqual(balances([], [], ['five', 'ada']), {});
});

/* ---------- formatting ---------- */

check('formatMoney naira whole', function () {
  assert.strictEqual(money(6000, 'NGN'), '₦6,000');
});

check('formatMoney dollars whole', function () {
  assert.strictEqual(money(6000, 'USD'), '$6,000');
});

check('formatMoney naira with kobo', function () {
  assert.strictEqual(money(1500.5, 'NGN'), '₦1,500.50');
});

check('formatMoney negative keeps the sign in front', function () {
  assert.strictEqual(money(-2500, 'NGN'), '-₦2,500');
});

/* ---------- simplification and rounding ---------- */

check('simplifyDebts matches the biggest debtor to the biggest creditor', function () {
  assert.deepStrictEqual(
    simplify({ a: -7000, b: 4000, c: 3000 }),
    [
      { fromId: 'a', toId: 'b', amount: 4000 },
      { fromId: 'a', toId: 'c', amount: 3000 }
    ]
  );
});

check('1,000 split 3 ways rounds to the kobo', function () {
  var b = balances([chit('five', 1000, ['five', 'ada', 'bola'])], [], ['five', 'ada', 'bola']);
  assert.strictEqual(b.NGN.net.five, 666.67);
  assert.strictEqual(b.NGN.net.ada, -333.33);
});

check('partial settlement leaves the rest owed', function () {
  var b = balances(
    [chit('five', 12000, ['five', 'ada'])],
    [{ id: 's1', fromId: 'ada', toId: 'five', amount: 2000, currency: 'NGN', at: 2 }],
    ['five', 'ada']
  );
  assert.strictEqual(b.NGN.net.ada, -4000);
  assert.deepStrictEqual(b.NGN.debts, [{ fromId: 'ada', toId: 'five', amount: 4000 }]);
});

console.log('\n' + passed + '/31 checks passed.');
