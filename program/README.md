# ClawVault (`magiclaw`) — Anchor Program

ClawVault is a provably fair, high-speed on-chain arcade claw machine program on Solana built with Anchor and [MagicBlock Ephemeral Rollups (ER)](https://docs.magicblock.gg). It combines sub-second gasless arcade gameplay on an Ephemeral Rollup with Solana L1 security, decentralized asset custody, verifiable randomness (VRF), Pyth price oracles, and automated L1 settlement via Magic Actions.

---

## 🚀 Live Devnet Deployment

The ClawVault program is live and deployed on Solana Devnet:

| Parameter | Value |
| :--- | :--- |
| **Program ID** | [`9MPCK9ic71C2pdoTYMz91CSpYppiuVKMTTNWoTKgv3MW`](https://explorer.solana.com/address/9MPCK9ic71C2pdoTYMz91CSpYppiuVKMTTNWoTKgv3MW?cluster=devnet) |
| **Deployment Signature** | [`2uu98HNPojXRXpSPZ6iCpiR68YeFej9Cn9zvYFcQTRuLqdNx5vKpP5wmuJTVXVBeX6QZGUQrhPQWVNH6WY7GcQ7`](https://explorer.solana.com/tx/2uu98HNPojXRXpSPZ6iCpiR68YeFej9Cn9zvYFcQTRuLqdNx5vKpP5wmuJTVXVBeX6QZGUQrhPQWVNH6WY7GcQ7?cluster=devnet) |
| **Upgrade Authority** | [`Eyt21KBUwkXGfnTRqDexJDYkcBtm7CGEiq3FVf5s49u3`](https://explorer.solana.com/address/Eyt21KBUwkXGfnTRqDexJDYkcBtm7CGEiq3FVf5s49u3?cluster=devnet) |
| **ProgramData Account** | [`fSHD5ubDqTdvK8X1edpWDdCRLuni2gzbN5GxTLtjujE`](https://explorer.solana.com/address/fSHD5ubDqTdvK8X1edpWDdCRLuni2gzbN5GxTLtjujE?cluster=devnet) |
| **Executable Size** | 633,912 bytes |
| **Network** | Solana Devnet |
| **RPC Endpoint Used** | Helius Devnet RPC (`https://devnet.helius-rpc.com`) |

---

## 🏛️ Architecture Overview

ClawVault bridges Solana L1 security with MagicBlock Ephemeral Rollup performance:

```
                      ┌───────────────────────────────────────────────┐
                      │              Solana Base Layer (L1)           │
                      │                                               │
                      │  • USDC Vault ATA       • Prize Vault ATAs    │
                      │  • PlayerLedger (PDA)   • Program Executable  │
                      └──────────────┬──────────────────▲─────────────┘
                                     │                  │
                      delegate_machine()          commit_and_undelegate()
                      delegate_session()          Magic Actions (L1 claim/withdraw)
                                     │                  │
                                     ▼                  │
                      ┌─────────────────────────────────┴─────────────┐
                      │         MagicBlock Ephemeral Rollup (ER)       │
                      │                                               │
                      │  • Sub-50ms tick time                         │
                      │  • Gasless transactions with Session Keys    │
                      │  • steer_claw / drop_claw                     │
                      │  • MagicBlock VRF (consume_vrf_grip)          │
                      │  • Pyth / Lazer Price Oracle integration      │
                      │  • Instant sell_back_prize                    │
                      └───────────────────────────────────────────────┘
```

1. **L1 Escrow & Administration**:
   - The admin creates the machine on Solana L1, configures prize capsules in 16 slots, and funds USDC liquidity.
   - All physical prize SPL tokens / NFTs and deposited USDC reside safely in L1 token accounts owned by the program's PDA (`vault_authority`).
2. **Account Delegation**:
   - `MachineConfig` and `PlayerSession` PDAs are delegated to the MagicBlock Ephemeral Rollup validator via the Magic Router program.
3. **High-Frequency Gameplay (ER)**:
   - Players steer the claw using an authorized ephemeral session key (`steer_claw`), requiring zero user wallet pop-ups and zero SOL gas.
   - When dropped (`drop_claw`), hit-testing verifies capsule proximity, triggers the MagicBlock VRF request, and enters an awaiting state.
4. **Verifiable Randomness (VRF)**:
   - MagicBlock's Ephemeral VRF provider signs the callback (`consume_vrf_grip`), passing 32 bytes of cryptographically secure randomness.
   - Grip strength is evaluated deterministically against public tier odds + bullseye skill bonus.
5. **Instant Choice & Settlement**:
   - **Sell Back**: Player can sell the won prize back to the machine instantly on ER for USDC credited to their session balance.
   - **Physical Claim**: Player commits a prize claim action, automatically triggering an L1 token transfer from the prize vault to the player's wallet.
   - **Withdrawal & Undelegation**: Player undelegates `PlayerSession` back to L1, withdrawing any remaining USDC balance safely.

---

## 📦 Account State & PDA Structure

### PDAs (Program Derived Addresses)

| Account | Seeds | Purpose |
| :--- | :--- | :--- |
| `MachineConfig` | `[b"machine", machine_id.to_le_bytes()]` | Cabinet parameters, public tier grip odds, and 16 prize slots. Delegated to ER. |
| `PlayerSession` | `[b"session", machine.key(), owner.key()]` | Live ER session state: position, balance, session key, round state. Delegated to ER. |
| `PlayerLedger` | `[b"ledger", machine.key(), owner.key()]` | Non-delegated L1 accounting ledger. Tracks monotonic deposits/withdrawals and claim nonces to prevent replay attacks. |
| `VaultAuthority` | `[b"vault_authority", machine.key()]` | PDA authority that owns all L1 USDC and prize token vault accounts. |

### Prize Tiers & Odds

Prizes are arranged across 4 distinct rarity tiers:
- **Tier 0 (Common)**: Default 65.00% grip odds, 90% buyback.
- **Tier 1 (Rare)**: Default 32.00% grip odds, 92% buyback.
- **Tier 2 (Epic)**: Default 12.00% grip odds, 95% buyback.
- **Tier 3 (Grail)**: Default 4.00% grip odds, 95% buyback.

---

## 🕹️ Instruction Set

### Group A: Machine Administration (Solana L1)
- **`initialize_machine`**: Initializes the `MachineConfig` PDA with ID, fee, odds, and playfield dimensions.
- **`stock_prize_slot`**: Stocks a prize slot (0..15) with an SPL token mint, coordinates `(x, z)`, prize amount, oracle feed, and fallback floor price.
- **`delegate_machine`**: Delegates the `MachineConfig` account to MagicBlock Ephemeral Rollup.
- **`fund_usdc_liquidity`**: Deposits USDC into the machine's liquidity vault to support buybacks.

### Group B: Player Onboarding (Solana L1)
- **`init_and_deposit_session`**: Initializes `PlayerLedger` (if needed), transfers USDC deposit to the vault, records the authorized `session_key` and expiry, and creates `PlayerSession`.
- **`delegate_session`**: Delegates the `PlayerSession` account to the Ephemeral Rollup.

### Group C: Real-Time Gameplay (MagicBlock ER)
- **`start_play`**: Deducts the play fee from `usdc_balance`, resets claw coordinates to spawn `(500, 500)`, and transitions state to `Steering`.
- **`steer_claw`**: Updates coordinates with bounded step delta $(\Delta x, \Delta z \le \pm 40)$ clamped within $[0, 1000]$.
- **`drop_claw`**: Performs squared-distance hit-testing against all stocked slots. If hit, reserves slot, checks bullseye bonus, and CPIs the MagicBlock VRF program.
- **`consume_vrf_grip`**: Scoped VRF callback instruction invoked exclusively by the VRF program identity. Evaluates roll `0..9,999` against tier grip odds + bullseye bonus.
- **`cancel_stuck_vrf`**: Recovery function allowing refund of play fee and slot release if a VRF callback does not arrive within grace period (60s).

### Group D: Settlement & L1 Magic Actions
- **`sell_back_prize`**: Sells the won prize back to the machine using Pyth oracle valuation or floor price, crediting USDC directly to `PlayerSession.usdc_balance`.
- **`claim_prize`**: Claims the physical prize; attaches an `ExecuteL1PrizeClaim` Magic Action to transfer the prize mint ATA on L1 upon undelegation.
- **`request_withdraw_and_undelegate`**: Commits session state and undelegates `PlayerSession` back to L1. Attaches `ExecuteL1UsdcWithdraw` action when balance $> 0$.
- **`execute_l1_prize_claim`**: Permissionless L1 settlement instruction to transfer prize token to player using monotonic nonce verification.
- **`execute_l1_usdc_withdraw`**: Permissionless L1 settlement instruction to transfer remaining USDC back to player's wallet.

---

## 🎯 Gameplay Mechanics & Formulas

### 1. Spatial Hit Testing
Playfield dimensions: $1000 \times 1000$.
A capsule at $(x_s, z_s)$ is captured if:
$$(x_{claw} - x_s)^2 + (z_{claw} - z_s)^2 \le r_{capture}^2 \quad (\text{default } r_{capture} = 65)$$

### 2. Bullseye Skill Bonus
If the player drops within the bullseye radius:
$$(x_{claw} - x_s)^2 + (z_{claw} - z_s)^2 \le r_{bullseye}^2 \quad (\text{default } r_{bullseye} = 25)$$
The player receives an additional bonus (default +300 bps / +3%) added to the base tier grip odds (capped at 9,900 bps / 99%).

### 3. Pyth Oracle Valuation Math
When selling back an SPL token or NFT, value is determined using Pyth / MagicBlock price updates:
$$\text{Gross USDC} = \frac{\text{Prize Amount} \times \text{Oracle Price} \times 10^{\text{USDC Decimals}}}{10^{\text{Prize Decimals}} \times 10^{\text{Price Exponent}}}$$
$$\text{Final Buyback USDC} = \frac{\text{Gross USDC} \times \text{Tier Buyback BPS}}{10,000}$$

If no oracle feed is provided or the price feed is stale ($> 60\text{s}$), the capsule's `fallback_buyback_usdc` is used.

---

## 🛠️ Development & Testing

### Prerequisites
- [Rust](https://www.rust-lang.org/tools/install) (1.79.0+)
- [Solana CLI](https://docs.solanalabs.com/cli/install) (1.18+)
- [Anchor CLI](https://www.anchor-lang.com/docs/installation) (0.30.1)

### Building
```bash
cd program
anchor build
```

### Running Tests
The test suite executes 16 unit and integration tests powered by **LiteSVM**:
```bash
cargo test
```

### Deploying to Devnet
```bash
solana program deploy \
  --url "https://devnet.helius-rpc.com/?api-key=<YOUR_KEY>" \
  --keypair ~/.config/solana/id.json \
  --program-id target/deploy/magiclaw-keypair.json \
  target/deploy/magiclaw.so
```

---

## 📄 License
Licensed under the MIT License.
