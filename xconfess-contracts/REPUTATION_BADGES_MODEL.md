# ReputationBadges Contract Model

## Overview

The ReputationBadges contract manages user reputation scores and achievement badges on the Xconfess platform. It supports two complementary flows for badge distribution and reputation management:

1. **Self-Service Badge Minting** - Users can mint badges they've earned based on their activity
2. **Admin-Managed Badge Awards** - Administrators can grant badges and adjust reputation for community management

---

## Badge & Reputation Lifecycle Documentation

This section outlines the functional lifecycle of reputation assets within the Xconfess ecosystem, providing contributors with clear insight into how rewards are initialized, earned, moved, or degraded.

### 1. Minting (`mint_badge`)

- **Plain Language Description:** This is a self-service action where a contributor actively claims a badge they have earned through community participation (e.g., posting a first confession).
- **Access Control:** **User-Operated (Self-Authorized).** The recipient account must authorize the transaction to mint the asset to their own address.
- **Relevant Test Verification:** Tested via `test_mint_and_award_can_coexist` inside `contracts/reputation-badges/src/test.rs`.

### 2. Awarding (`award_badge`)

- **Plain Language Description:** This allows badges to be granted directly to a contributor's profile without requiring action from the user. It is typically used for specific, verified off-chain milestones or community management achievements.
- **Access Control:** **Admin-Only.** Restricted entirely to the contract administrator address.
- **Relevant Test Verification:** Verified in `test_award_badge_admin_only` and `test_admin_can_award_different_badge_types` in `contracts/reputation-badges/src/test.rs`.

### 3. Transferring (`transfer_badge`)

- **Plain Language Description:** Moves a previously earned or awarded badge instance away from the current owner's wallet address and assigns ownership to a new recipient address.
- **Access Control:** **User-Operated.** Must be explicitly authorized by the current badge holder.
- **Relevant Test Verification:** Monitored under `test_transfer_admin` boundaries and badge ownership limits within `contracts/reputation-badges/src/test.rs`.

### 4. Revocation (`revoke_badge`)

- **Plain Language Description:** Allows a badge to be permanently destroyed and deleted from the platform. Once deleted, the badge cannot be recovered or restored.
- **Access Control:** **User-Operated.** Authorized and executed directly by the individual badge owner.
- **Relevant Test Verification:** Bound alongside state updates tracked within `contracts/reputation-badges/src/test.rs`.

### 5. Decay (`apply_decay` / `recalibrate_epoch`)

- **Plain Language Description:** A time-based reduction mechanic that ensures reputation reflects recent community activity. Positive reputation gradually decays down toward 0 at a rate of 5% every 7 days, while highly negative reputation shrinks back toward 0 over time as an automated recovery mechanism.
- **Access Control:** **Public or Admin-Driven.** Anyone can call `apply_decay` for an individual user to process pending updates. Admins can batch-process multiple users via `recalibrate_epoch`.
- **Relevant Test Verification:** Heavily validated via `test_reputation_decay_basic`, `test_reputation_decay_floor`, `test_reputation_decay_negative`, and `test_recalibrate_epoch` inside `contracts/reputation-badges/src/test.rs`.

---

## Authorization Model

### Roles

| Role       | Capabilities             | Actions                                                                                                 |
| ---------- | ------------------------ | ------------------------------------------------------------------------------------------------------- |
| **Admin**  | Full contract management | `initialize`, `transfer_admin`, `create_badge`, `award_badge`, `adjust_reputation`, `recalibrate_epoch` |
| **User**   | Self-service minting     | `mint_badge`, `transfer_badge`, `revoke_badge`, read operations, `apply_decay`                          |
| **Public** | Read-only access         | `get_badges`, `has_badge`, `get_user_reputation`, `get_badge_count`, `get_total_badges`, `apply_decay`  |

### Authorization Rules

- **`initialize(admin: Address)`**
  - Caller: Authorized by `admin` address (self-auth required)
  - Effect: Sets the contract admin (one-time only)
  - Fail if already initialized
- **`transfer_admin(new_admin: Address)`**
  - Caller: Current admin ONLY
  - Effect: Transfers admin rights to new address
  - Both current admin and new admin must authorize

- **`create_badge(badge_type, name, description, criteria)`**
  - Caller: Admin only
  - Effect: Creates or updates metadata for a badge type
  - Used to define badge display name, description, and earning criteria

- **`award_badge(recipient: Address, badge_type: BadgeType)`**
  - Caller: Admin only
  - Effect: Grants a badge directly to recipient (does not require recipient auth)
  - Fails if recipient already owns this badge type
  - Returns badge ID

- **`mint_badge(recipient: Address, badge_type: BadgeType)`**
  - Caller: User (self-auth required - recipient must authorize)
  - Effect: User self-mints a badge they've earned
  - Fails if user already owns this badge type
  - Returns badge ID

- **`transfer_badge(badge_id: u64, to: Address)`**
  - Caller: Current badge owner (must authorize)
  - Effect: Transfers badge ownership to new address
  - Fails if recipient already owns this badge type

- **`revoke_badge(badge_id: u64)`**
  - Caller: Badge owner (must authorize)
  - Effect: Permanently deletes the badge
  - Badge cannot be recovered after revocation

- **`adjust_reputation(user: Address, amount: i128, reason: String)`**
  - Caller: Admin only
  - Effect: Adds or subtracts reputation from user
  - Use case: Manual adjustments for community management or corrections
  - Negative amounts reduce reputation; positive increases it
  - Also resets the user's decay timer (reputation considered "fresh")

- **`apply_decay(user: Address)`**
  - Caller: Public (anyone can call for any user)
  - Effect: Explicitly applies pending reputation decay for a user
  - Gas-efficient operation for updating stale reputation scores
  - Returns the new reputation after decay is applied
  - Updates the user's last update timestamp to prevent re-application

- **`recalibrate_epoch(user_batch: Vec<Address>)`**
  - Caller: Admin only
  - Effect: Batch process reputation decay for multiple users
  - Bounded operation: processes only the provided batch of users
  - Increments the global epoch counter
  - Returns the number of users whose reputation was updated
  - Use case: Periodic maintenance to keep reputation scores fresh

- **Read Operations** (no auth required)
  - `get_admin()` - Returns current admin address
  - `get_user_reputation(user)` - Returns user's reputation score
  - `get_badges(owner)` - Returns all badges owned by address
  - `has_badge(owner, badge_type)` - Checks if user owns specific badge type
  - `get_badge_count(owner)` - Returns count of badges owned
  - `get_badge(badge_id)` - Returns badge by ID
  - `get_total_badges()` - Returns total badges minted
  - `get_badge_type_metadata(badge_type)` - Returns display metadata (`BadgeTypeMetadata`) for a badge type, or `None` if not yet defined
  - `has_badge_type_metadata(badge_type)` - Returns `true` if an admin has defined metadata for the badge type
  - `get_user_badge_summary(user)` - Returns `(Vec<u64>, i128)` — badge IDs and reputation score in one call for efficient off-chain queries

## Badge Types

Pre-defined badge types with intended earning criteria:

```rust
pub enum BadgeType {
    ConfessionStarter,   // First confession posted
    PopularVoice,        // 100+ reactions received
    GenerousSoul,        // Tipped 10+ confessions
    CommunityHero,       // 50+ confessions posted
    TopReactor,          // 500+ reactions given
}
```
