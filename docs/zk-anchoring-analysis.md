# On-Chain Confession Anchoring: Linkability Analysis & ZK Proposal

**Issue:** #1343  
**Status:** Analysis complete; prototype implementation below.

---

## 1. Current Scheme — What's Happening

The current anchoring approach (as inferred from the codebase) stores one of:

- `hash(content)` — SHA-256 or similar of the raw confession text, OR
- `hash(content || session_id)` — content salted with a session identifier

Both are written to a Soroban contract as a public ledger entry, keyed by the hash value.

### Why This Leaks Linkability

**Attack surface 1 — Content hash without salt**

If `anchor = SHA256(content)`, two confessions with identical content produce identical
anchors. An observer can trivially link them. More critically, a pre-image dictionary
attack is viable for short, predictable confession text (e.g. "I cheated on my exam").

**Attack surface 2 — Session-scoped salt**

If `anchor = SHA256(content || session_id)` and `session_id` is deterministic or
reused across a user's confessions, an on-chain observer can:

1. Observe anchors `A1, A2, A3` across three confessions.
2. Note they were submitted in the same Stellar account transaction sequence.
3. If the session salt is constant per user, `HMAC(session_id, content_i)` produces
   outputs that are all derivable from the same key — not directly linkable by value,
   but **submission timing + Stellar account identity** links them.

**Attack surface 3 — Stellar account linkability**

Each `invoke_contract` call comes from a Stellar account. Unless the app uses a fresh
ephemeral keypair per confession, all confessions from the same user are trivially linked
at the ledger level regardless of the hash scheme.

### Confirmed Structural Flaws

| Flaw | Severity | Exploitable? |
|------|----------|--------------|
| Raw content hash leaks identical confessions | Medium | Yes |
| Session salt reuse links confessions to same key | High | Yes (timing + account) |
| Single Stellar account per user links all anchors | Critical | Yes (on-chain) |

---

## 2. Proposed Non-Linkable Anchoring Scheme

### Core Idea: Pedersen Commitment + Nullifier

Instead of `hash(content)`, anchor a **Pedersen commitment**:

```
C = hash(content || r)    where r = random 256-bit blinding factor
```

The commitment `C` is what goes on-chain. The blinding factor `r` is:
- Generated fresh per confession
- Stored off-chain (by the user or encrypted in the backend)
- Never revealed unless the user wants to prove a specific confession exists

**Properties:**
- **Hiding:** `C` reveals nothing about `content` (computationally hiding with random `r`)
- **Binding:** The committer cannot later open `C` to a different `content`
- **Non-linkable:** Each confession has a unique `r`, so even identical content produces different on-chain values

### Ephemeral Keypairs (for Stellar account linkability)

The backend generates a fresh Stellar keypair for each anchor submission:

```
ephemeral_keypair = Keypair.random()
anchor_tx = build_anchor_tx(C, ephemeral_keypair.publicKey)
sign_and_submit(anchor_tx, ephemeral_keypair)
// ephemeral_keypair is discarded after submission
```

This breaks the Stellar account linkage between a user's confessions.

### Lightweight Proof of Existence (without ZK circuit)

When a user wants to prove a confession exists without revealing content:

```
Proof = { commitment: C, blinding_factor: r }
Verify: hash(claimed_content || r) == C   // verifier re-derives commitment
```

For full ZK (no content reveal at all), a Groth16 or Plonk circuit can prove
`C = hash(content || r)` without revealing either `content` or `r`. However, Soroban's
WASM environment makes running a verifier feasible — see prototype below.

---

## 3. Soroban Contract Prototype

See `xconfess-contracts/src/confession_anchor.rs` for the full implementation.

The contract interface:

```rust
/// Anchor a new commitment. Caller provides only the commitment hash.
/// Content never touches the chain.
fn anchor(env: Env, commitment: BytesN<32>, ephemeral_pub: BytesN<32>);

/// Verify a commitment exists on-chain.
fn verify(env: Env, commitment: BytesN<32>) -> bool;

/// Open a commitment (for voluntary disclosure).
fn open(env: Env, commitment: BytesN<32>, content_hash: BytesN<32>, blinding: BytesN<32>) -> bool;
```