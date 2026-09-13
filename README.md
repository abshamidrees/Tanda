# Tanda

Tanda is a rotating savings circle that runs inside Nimiq Pay: a group agrees on a share, everyone pays it each round, and one member takes the whole pot until every member has had a turn. It is the tanda, the committee, the susu and the kitty, one of the most widely used savings arrangements in the world, with a shared record that every member can check.

<!-- Screenshot of a live circle with at least one settled round goes here, once the real circle has run. -->

## How a circle works

1. **Create.** Name the circle, set the share in NIM, pick weekly or monthly, and choose 3 to 12 members. Tanda shows what everyone pays and receives before anyone commits: six members at 500 NIM each pay 3,000 NIM and each receive 3,000 NIM.
2. **Invite.** Share the six-character code or the deeplink. Each member sees the full terms, the rotation order and the round they would be up in before joining. The circle starts when the last seat fills.
3. **Pay each round.** Members pay their share straight to the member who is up, through Nimiq Pay's own send dialog. The payer records the transaction; the member who is up confirms it arrived.
4. **Rotate until closed.** When every share in a round is confirmed, the round settles and the next member is up. After the last round, the circle closes and every member sees that they are square.

## Nimiq Pay integration

Every core action is a wallet action. The app calls:

- **`init()`** from `@nimiq/mini-app-sdk`, which gates the whole app. Outside Nimiq Pay, the only thing shown is a card with a QR code and the deeplink; nothing is fetched.
- **`isConsensusEstablished()`**, before anything reads or writes.
- **`listAccounts()`**, to read the address a member is paid at when they create or join a circle. Nimiq Pay asks the user first.
- **`sendBasicTransactionWithData()`**, which opens the native send dialog, pre-filled with the recipient, the amount in Luna and a memo naming the round and the share. The memo never carries the circle code, because memos are public. Amounts are integer Luna throughout.
- **`window.nimiqPay.language`**, through the SDK's `getHostLanguage()`, to choose English or Spanish.
- **`requestDeviceIdentifier({ reason })`**, as the device's handle in a circle, and to show the first-open introduction only once. It identifies a device, not a person, and never authorises anything that moves money.
- **The deeplink** `https://nimpay.app/miniapps/open/tanda-omega-sooty.vercel.app?join=CODE` for invites. The code also travels as plain text in every invite, so a member can type it if the link does not carry it.

A cancelled payment resolves with an error object rather than rejecting, so every provider call is narrowed before its result is used; a cancelled send never reaches the server. The provider has no transaction-history method, so the server checks each recorded hash against a public Nimiq indexer and marks shares it can match as verified on chain. Before the wallet can open a second time for the same share, the app looks on chain for a first payment it never heard back about, so a share is not paid twice.

## What Tanda does not do

- **It never holds money.** Every share is a direct payment from one member's wallet to another's. Tanda is the schedule, the record and the reminder.
- **It cannot force anyone to pay.** Two-sided confirmation makes non-payment visible and attributable to a named member and round. That is not the same as preventing it.
- **It never decides the order at random.** Turn order is the order members join in, fixed as each member joins and visible to every member before the first round opens. Nothing in a circle depends on randomness, deliberately, so the competition's rule against outcomes decided by randomness does not apply to it.
- **It does not confirm on anyone's behalf.** A share verified on chain still needs the receiving member's confirmation: the chain proves a transfer happened, and only the receiver can say it counted.

What it stores, to run a circle: the circle's terms, each member's display name and Nimiq address, the device identifier Nimiq Pay issues for this app, whether that device has seen the introduction, and the transaction hashes members record. It stores no keys, no balances and no personal details beyond the name a member chooses.

## Run it yourself

Requires Node.js 22 or later.

```bash
npm install
npm run seed        # optional: one example circle, in an embedded local database
npm run dev -- --host
```

With no `DATABASE_URL`, the server runs on PGlite, an embedded Postgres, so there is nothing else to set up. For a real deployment, set `DATABASE_URL` to a Postgres database; migrations run on the first request.

To open your local build inside Nimiq Pay, put the phone on the same Wi-Fi network, open **Mini Apps** in Nimiq Pay and enter the **Network** URL that `npm run dev -- --host` prints, for example `http://192.168.1.42:5173`. Nimiq Pay's hidden developer menu switches to testnet: long-press the settings button for ten seconds.

The deployed app opens in Nimiq Pay from [nimpay.app/miniapps/open/tanda-omega-sooty.vercel.app](https://nimpay.app/miniapps/open/tanda-omega-sooty.vercel.app), or by entering `https://tanda-omega-sooty.vercel.app` in Mini Apps.

```bash
npm test            # the nine error states, the wallet gate, create and join
npm run build
```

## Licence

MIT. See [LICENSE](LICENSE).
