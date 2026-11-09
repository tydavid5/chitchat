# ChitChat: Requirements

## Problem

Splitting money with friends means a spreadsheet nobody updates and a chat full of "you owe me" messages nobody can add up.

## Introduction

ChitChat is a group chat that is the ledger. Friends talk about money normally, the app turns money mentions into ledger entries, a live balance board shows who owes whom, and one tap settles up. It stitches three things that normally live apart (a chat app, a spreadsheet, and a settlement calculator) into one place, which is the Frankenstein category of Kiroween 2026: seemingly incompatible elements built into something unexpectedly useful.

ChitChat is a demo with pretend balances. No real money moves in the app. Settlement is a record only.

## Glossary

- Room: a group of 2 or more people sharing expenses, joined by a 4-letter code.
- Member: a person in a room, identified by a display name on their device.
- Chit: one ledger entry recording that a member paid an amount, split among some members.
- Balance board: the per-member net balance and the simplified list of who owes whom.
- Settle: marking a debt as paid, which records it and updates the balances.

## Requirements

### Requirement 1: Rooms without accounts

**User Story:** As a friend in a group, I want to open a room with a short code and a display name, so I can start splitting costs without creating an account.

#### Acceptance Criteria

1. WHEN a user opens the app THEN the app SHALL show a room code entry and a display name entry, with a create and a join action.
2. WHEN a user creates a room THEN the app SHALL generate a random 4-letter code.
3. WHEN a user joins with a code THEN the app SHALL show the room, its members, and its history.
4. WHEN a user opens a link with ?room=CODE THEN the app SHALL join that room directly.
5. WHEN a user has no account THEN the app SHALL still let them use every feature as a guest.

### Requirement 2: Live group chat

**User Story:** As a member, I want my messages to appear on every member's phone at once, so the group talks in one place.

#### Acceptance Criteria

1. WHEN a member sends a message THEN the app SHALL broadcast it to every member in the room within a few seconds.
2. WHEN a member joins THEN the app SHALL show them the room's past messages.
3. WHEN a member is typing THEN the app SHALL show a typing indicator to the others.
4. WHEN the connection drops THEN the app SHALL keep the typed draft and reconnect without losing it.

### Requirement 3: Money parser with human confirmation

**User Story:** As a member, I want money I mention in chat to become a ledger entry I confirm with one tap, so I never type the same expense twice.

#### Acceptance Criteria

1. WHEN a message contains an amount THEN the app SHALL propose a draft chit showing payer, amount, split, and note.
2. WHEN a message says "split" with a count or names THEN the app SHALL split the amount among those members.
3. WHEN no split is stated THEN the app SHALL split the amount equally among all room members.
4. WHEN a draft chit is shown THEN the app SHALL NOT count it until the payer taps confirm.
5. WHEN a draft chit is wrong THEN the payer SHALL be able to edit the amount, the split, or the note before confirming.
6. WHEN the parser cannot understand a message THEN the app SHALL leave the message as plain chat and propose nothing.

### Requirement 4: Ledger

**User Story:** As a member, I want a readable list of every confirmed expense, so the group can see where the money went.

#### Acceptance Criteria

1. WHEN a chit is confirmed THEN the app SHALL add it to the ledger with payer, amount, split, note, and time.
2. WHEN a member opens the ledger THEN the app SHALL list chits newest first.
3. WHEN the payer made a mistake THEN the payer SHALL be able to edit or delete their own chit.
4. WHEN a chit is edited or deleted THEN the app SHALL update the balance board at once.

### Requirement 5: Balance board

**User Story:** As a member, I want to see who owes whom at a glance, so nobody has to do the maths.

#### Acceptance Criteria

1. WHEN the ledger changes THEN the app SHALL recompute every member's net balance.
2. WHEN the balance board is shown THEN the app SHALL show each member's net balance and the simplified debts (who owes whom, how much).
3. WHEN debts can be simplified THEN the app SHALL show the smallest set of payments that settles the room.
4. WHEN a member has a zero balance THEN the app SHALL show them as settled.

### Requirement 6: Settle

**User Story:** As a member, I want one tap to record that a debt is paid, so the board clears without an argument.

#### Acceptance Criteria

1. WHEN a member taps settle on a debt THEN the app SHALL record the settlement and update the balances.
2. WHEN a settlement is recorded THEN the app SHALL show it in the ledger as a settlement, not as an expense.
3. WHEN all debts are settled THEN the app SHALL show the room as fully settled.
4. WHEN a settlement was a mistake THEN the member SHALL be able to undo it.

### Requirement 7: Demo mode, honestly labelled

**User Story:** As a judge, I want to know what is real and what is pretend, so I can trust the demo.

#### Acceptance Criteria

1. WHEN the app loads THEN the app SHALL show a visible "Demo: pretend balances, no real money moves" label.
2. WHEN a settlement is recorded THEN the app SHALL NOT claim any real payment happened.
3. WHEN the app is described anywhere THEN the description SHALL call the balances pretend.

### Requirement 8: Phones first

**User Story:** As a member on a phone, I want the app to work in my mobile browser, so I can use it at the table.

#### Acceptance Criteria

1. WHEN the app loads on a phone THEN the app SHALL fit the screen with no sideways scrolling.
2. WHEN the app loads THEN the app SHALL work as a single page with no build step and no install.
3. WHEN the app is opened THEN the app SHALL load over plain HTTPS hosting.
