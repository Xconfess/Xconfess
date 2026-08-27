# ADR-002: Stellar/Soroban for On-Chain Features

## Status

Accepted

## Context

xConfess includes on-chain features: XLM micro-tipping between users and anchoring confession hashes for immutability. A smart contract platform is needed that supports low-fee microtransactions (tipping amounts can be fractions of a cent), has a good Rust SDK, and is production-ready.

## Options Considered

- **Option A — Ethereum/EVM (Solidity)**: The most widely used smart contract platform. High gas fees make microtransactions impractical. Solidity ecosystem is large but fees are prohibitive for sub-cent tips.
- **Option B — Stellar/Soroban (Rust)**: Stellar is purpose-built for payments with fees of fractions of a cent. Soroban is Stellar's smart contract layer written in Rust. Native XLM integration makes tipping straightforward.
- **Option C — Solana**: Low fees and high throughput, but complex account model and higher operational overhead.

## Decision

We chose **Option B** — Stellar/Soroban with Rust contracts.

Stellar's fee model (stroops) makes sub-cent tipping economically viable. Soroban contracts compile to WASM and are invoked via the Stellar SDK already used for payment processing. Using a single chain for both payments and contracts reduces operational complexity.

## Consequences

### Positive

- Transaction fees are fractions of a cent — microtipping is viable
- Rust contracts are memory-safe and auditable
- Single SDK (@stellar/stellar-sdk) covers both payments and contract invocation

### Negative

- Soroban ecosystem is smaller than EVM — fewer libraries and tooling options
- Contributors need Rust knowledge to work on contracts
- Soroban is relatively new; breaking changes in the SDK are possible

## References

- xconfess-contracts/ (Soroban Rust contracts)
- xconfess-backend/src/stellar/
- xconfess-backend/src/tipping/
- https://developers.stellar.org/docs/smart-contracts
