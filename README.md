# MagiClaw

**Provably fair, zero-database, real-time 3D arcade claw machine on Solana — powered by MagicBlock**

MagiClaw brings **Entertainment Finance** fully on-chain: consumers deposit USDC, steer a physics-driven 3D claw in real time with zero wallet popups, pull collectible SPL token and NFT booster packs under cryptographically verifiable randomness, and choose immediately between **instant USDC buyback** or **L1 token custody**.

---

## Why MagiClaw?

Traditional Web3 arcade and gacha apps break down on two fronts:

1. **Latency & Wallet Friction**: Confirming every joystick move on L1 (~200–400ms slots + wallet signature popups + transaction fees) ruins tactile arcade gameplay.
2. **Opaque Off-Chain Backends**: Most games push movement, inventory, and RNG into a private Web2 database, forcing players to trust a server.

MagiClaw eliminates both compromises:

- **Zero Database — 100% On-Chain State**: There is **no Postgres, MongoDB, Redis, or off-chain game server**. Cabinet configuration, all 16 prize slots, live claw coordinates, VRF rolls, USDC balances, and replay-proof settlement nonces live strictly on Solana L1 and MagicBlock Ephemeral Rollup (ER) PDAs. Prize artwork and metadata are fetched directly from on-chain Metaplex Token Metadata PDAs.
- **Real-Time Arcade Feel on MagicBlock ER**: `MachineConfig` and `PlayerSession` accounts are delegated to a MagicBlock Ephemeral Rollup, enabling sub-50ms state updates and near-zero-fee high-frequency steering without breaking Solana composability.
- **Zero-Popup Gameplay via Ephemeral Session Keys**: Players sign once on L1 to deposit USDC and authorize a temporary browser-local `Keypair` (up to 24 hours). Every `start_play`, `steer_claw`, `drop_claw`, `sell_back_prize`, and `claim_prize` instruction runs seamlessly in the background.
- **Verifiable On-Chain Randomness (MagicBlock VRF)**: Grip outcomes are never computed off-chain. Dropping the claw over an in-stock capsule CPIs the MagicBlock Ephemeral VRF program (`#[vrf]`), and a scoped callback (`#[vrf_callback]`) resolves the roll (`0..9,999`) deterministically against public tier odds plus a dead-center skill bonus.
- **Instant Entertainment Finance Settlement**: Won capsules can be **sold back instantly on ER** for USDC (priced live via Pyth/MagicBlock Lazer `PriceUpdateV2`/`PriceUpdateV3` accounts with a safe floor fallback) or **claimed to your Solana L1 wallet** from program-owned vaults.

---

## Live Devnet Deployment

| Component                     | Value                                                                                                                                             |
| :---------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Program ID (`magiclaw`)**   | [`9MPCK9ic71C2pdoTYMz91CSpYppiuVKMTTNWoTKgv3MW`](https://explorer.solana.com/address/9MPCK9ic71C2pdoTYMz91CSpYppiuVKMTTNWoTKgv3MW?cluster=devnet) |
| **Network**                   | Solana Devnet + MagicBlock Devnet ER                                                                                                              |
| **MagicBlock Router**         | `https://devnet-router.magicblock.app/`                                                                                                           |
| **MagicBlock ER Endpoint**    | `https://devnet-as.magicblock.app/`                                                                                                               |
| **Delegation Program**        | `DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh`                                                                                                    |
| **MagicBlock VRF Program**    | `Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz`                                                                                                     |
| **Ephemeral VRF Queue**       | `5hBR571xnXppuCPveTrctfTU7tJLSN94nq7kv7FRK5Tc`                                                                                                    |
| **Pyth Lazer Oracle Program** | `PriCems5tHihc6UDXDjzjeawomAwBduWMGAi8ZUjppd`                                                                                                     |

---

## Architecture & Delegation Lifecycle

MagiClaw splits responsibilities cleanly between **Solana L1 (Custody & Replay-Proof Settlement)** and **MagicBlock Ephemeral Rollup (Real-Time Gameplay & VRF)**:

```text
┌──────────────────────────────────────────────────────────────────────┐
│                         Solana Base Layer (L1)                       │
│                                                                      │
│  • VaultAuthority PDA   -> Owns L1 USDC & Prize Vault ATAs           │
│  • PlayerLedger PDA     -> Non-delegated monotonic replay guard      │
│  • Setup & Custody      -> initialize_machine, stock_prize_slot,     │
│                            fund_usdc_liquidity,                      │
│                            init_and_deposit_session                  │
│  • L1 Settlement        -> execute_l1_prize_claim,                   │
│                            execute_l1_usdc_withdraw                  │
└──────────────────┬───────────────────────────────▲───────────────────┘
                   │                               │
   delegate_machine() /                    commit() /
   delegate_session()                      commit_and_undelegate()
                   │                               │
                   ▼                               │
┌──────────────────────────────────────────────────┴───────────────────┐
│                   MagicBlock Ephemeral Rollup (ER)                   │
│                                                                      │
│  • Delegated PDAs   -> MachineConfig (16 slots), PlayerSession       │
│  • Session Key Play -> start_play, steer_claw (Δx/Δz ≤ ±40),         │
│                        drop_claw (hit-test + VRF request)            │
│  • MagicBlock VRF   -> consume_vrf_grip (SCOPED_VRF_IDENTITY signer) │
│  • Recovery         -> cancel_stuck_vrf (60s grace refund)           │
│  • Instant Choice   -> sell_back_prize (Pyth Lazer / floor pricing)  │
│                        or claim_prize (commits state to L1)          │
└──────────────────────────────────────────────────────────────────────┘
```

### Zero-Database Guarantee

| Concern                                       | How MagiClaw Handles It                                                                               |
| :-------------------------------------------- | :---------------------------------------------------------------------------------------------------- |
| **Machine odds, play fee & 16 prize slots**   | Stored in `MachineConfig` PDA on-chain                                                                |
| **Live claw position, balance & round state** | Stored in `PlayerSession` PDA on ER                                                                   |
| **Deposit, claim & withdrawal accounting**    | Enforced by non-delegated `PlayerLedger` PDA on L1                                                    |
| **Token & USDC custody**                      | Held in SPL ATAs owned by `VaultAuthority` PDA on L1                                                  |
| **Prize names, symbols & pack artwork**       | Decoded on client from Metaplex Token Metadata PDAs                                                   |
| **Session keypair**                           | Ephemeral `Keypair` stored solely in browser `localStorage`                                           |
| **Next.js API routes**                        | Stateless helpers only (`/api/rpc` proxy, `/api/faucet-usdc` tx builder, `/api/admin/auth` HMAC gate) |

---

## Gameplay Mechanics & Provably Fair Odds

### 1. Spatial Hit-Testing & Skill Bonus

The cabinet playfield spans `[0, 1000] × [0, 1000]`, spawning at `(500, 500)`. Each `steer_claw` call clamps movement deltas to `[-40, 40]` per instruction within a `15s` default round window.

When `drop_claw` executes on ER, the program evaluates squared Euclidean distance against every in-stock, unreserved `PrizeSlot`:

- **Capture Check**: `(claw_x - slot.x)² + (claw_z - slot.z)² <= capture_radius²` (default `65`)
  - Missing all capsules deducts the play fee and returns the session to `Idle` (`LastOutcome::Miss`).
- **Bullseye Skill Bonus**: `(claw_x - slot.x)² + (claw_z - slot.z)² <= bullseye_radius²` (default `25`)
  - Landing dead-center adds `+300 bps` (`+3%`) to the slot's base grip odds (capped at `9,900 bps` / `99%`).

### 2. Prize Tiers & Economics

| Tier  | Name       | Pack Finish    | Base Grip Odds | With Bullseye (+3%) | Buyback Rate |
| :---: | :--------- | :------------- | :------------: | :-----------------: | :----------: |
| **0** | **Common** | Cyan Booster   |     65.00%     |       68.00%        |     90%      |
| **1** | **Rare**   | Violet Booster |     32.00%     |       35.00%        |     92%      |
| **2** | **Epic**   | Pink Booster   |     12.00%     |       15.00%        |     95%      |
| **3** | **Grail**  | Gold Booster   |     4.00%      |        7.00%        |     95%      |

### 3. Verifiable Grip Resolution (`consume_vrf_grip`)

- `drop_claw` reserves the targeted capsule (`reserved = true`), increments `vrf_request_nonce`, and requests randomness from the MagicBlock VRF queue (`DEFAULT_EPHEMERAL_QUEUE`).
- Only the program-scoped `SCOPED_VRF_IDENTITY` PDA can invoke `consume_vrf_grip`.
- The first 4 bytes of the 32-byte VRF randomness are mapped modulo `10,000` (`0..9,999`) and compared against `effective_bps` (`roll < effective_bps`).
- **Late Callback & Stuck VRF Safety**: `vrf_request_nonce` blocks stale callbacks from settling newer rounds, and `cancel_stuck_vrf` lets the player or admin refund the play fee and unreserve the slot if a VRF response does not arrive within `60s` after `play_expires_at`.

### 4. Pyth Lazer Valuation & Replay-Proof L1 Settlement

- **Sell Back (`sell_back_prize`)**: Reads an on-chain Pyth/MagicBlock `PriceUpdateV2`/`PriceUpdateV3` account (`MAX_PRICE_AGE_SECS = 60s`), computes:
  $$\text{Gross USDC} = \frac{\text{prize\_amount} \times \text{oracle\_price} \times 10^6}{10^{\text{prize\_decimals} + |\text{exponent}|}}, \quad \text{Buyback} = \frac{\text{Gross USDC} \times \text{buyback\_bps}}{10{,}000}$$
  falling back cleanly to `fallback_buyback_usdc` if no feed is configured or the feed is stale. The capsule immediately returns to `in_stock = true` for the next player.
- **Claim & Withdraw (`execute_l1_prize_claim` / `execute_l1_usdc_withdraw`)**: `claim_prize` increments `claim_nonce` and commits `PlayerSession` to L1; `request_withdraw_and_undelegate` commits and undelegates `PlayerSession` back to L1. Permissionless L1 settlement instructions compare against `PlayerLedger.last_claimed_nonce` and `PlayerLedger.total_withdrawn_usdc` so every payout executes at most once.

---

## What Ships in This Repo

### 1. Anchor + MagicBlock Program (`program/`)

- **Framework**: Anchor `1.1.2` + `ephemeral-rollups-sdk` `0.18.0` (`anchor`, `vrf` features)
- **PDAs**:
  - `MachineConfig` (`["machine", machine_id]`)
  - `PlayerSession` (`["session", machine, owner]`)
  - `PlayerLedger` (`["ledger", machine, owner]`)
  - `VaultAuthority` (`["vault_authority", machine]`)
- **17 Instructions** spanning L1 Admin setup (`initialize_machine`, `stock_prize_slot`, `delegate_machine`, `undelegate_machine`, `fund_usdc_liquidity`), L1 Player onboarding (`init_and_deposit_session`, `delegate_session`), ER Real-Time Gameplay (`start_play`, `steer_claw`, `drop_claw`, `consume_vrf_grip`, `cancel_stuck_vrf`), and Settlement (`sell_back_prize`, `claim_prize`, `request_withdraw_and_undelegate`, `execute_l1_prize_claim`, `execute_l1_usdc_withdraw`).
- **16 Automated Tests**: 7 Rust unit tests (`pricing.rs`, `gameplay.rs`) + 9 end-to-end **LiteSVM** integration tests (`tests/clawvault.rs`) covering deposits, steering clamping, misses, VRF wins/slips, oracle & floor buybacks, L1 claims & replay rejection, session key expiry, withdrawals, zero-balance top-ups, and stuck VRF recovery.

### 2. Interactive 3D Arcade Frontend (`frontend/`)

- **Tech Stack**: Next.js `16.4.6`, React `19.3.0`, Three.js `0.187.0`, Tailwind CSS `4.3.3`, Solana Wallet Adapter
- **3D Claw Machine (`ClawMachineView`)**:
  - Custom Three.js arcade cabinet with animated gantry, claw arms, drop chute, brushed metal & LED ceiling textures, dotted pixel marquee, and live LCD readout
  - 16 procedurally rendered 3D booster pack capsules color-coded by rarity tier
  - Multi-camera modes (`hero`, `front`, `side`, `orbit`), laser target projection toggle, virtual joystick + keyboard controls, procedural Web Audio SFX + BGM, and a **Practice Demo Mode (`DEMO`)** requiring no wallet or tickets
- **3D Win Reveal (`PostWinModal` & `WinningPack3D`)**: Interactive 3D booster pack showcase with VRF roll proof and one-click **Sell Back** or **Claim to Wallet**
- **Tickets & Devnet Faucet (`TicketsModal`)**: Deposit Test USDC, top up session keys, claim Devnet Test USDC via `/api/faucet-usdc`, and cash out back to L1
- **Operator Admin Console (`/admin` & `/admin/mint-prizes`)**:
  - Initialize machines, fund USDC buyback liquidity, and toggle L1/ER delegation
  - **Semi-Auto Reward Loader**: Distributes any SPL token supply across 16 slots and 4 tiers using presets (`Balanced Arcade`, `Common Heavy`, `High Roller`, `Equal Tiers`) and batched stocking transactions
  - **Mint Prizes Studio**: Create Devnet SPL tokens and 1/1 NFTs with Metaplex Token Metadata directly from the browser

## License

MIT
