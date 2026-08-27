# Wave 5 Contributor Assignment Guide

For maintainers assigning contributors to Wave 5 issues. Follow this process to ensure consistent, fast placement.

---

## Quick Reference

| Action | When | GitHub Action |
|--------|------|---------------|
| Assign | Issue ready + contributor expresses interest | `Assign` |
| Split | Scope > 4 acceptance criteria OR > 3 files/modules | Create new issue, link |
| Close | Contributor unresponsive > 7 days after ping | `Close as stale` |
| Roll over | Wave 5 deadline passed + incomplete | Move to `Wave 6` tracking |

---

## 1. Evaluating Applications

### Check contributor readiness (5 minutes)
1. Open the contributor's GitHub profile
2. Verify they have a Stellar/Blockchain section in their profile OR prior open-source contributions
3. Check for: `rust`, `typescript`, or `stellar` in their repo list

### Match to appropriate issue
- **Low complexity (Trivial)**: Frontend UI polish, docs, test coverage
- **Medium complexity**: Backend API work, contract fixes, UX flows
- **High complexity**: Multi-module features, contract architecture

Match contributor skill to issue complexity:
```yaml
Frontend-only contributor → frontend issues only
Rust/Soroban experience → contracts issues
Full-stack → any, but prefer well-scoped
```

---

## 2. Assignment Process

### When assigning (1 minute)
1. Ensure issue has `Stellar Wave` and correct `P#` label
2. Comment: `@<username> assigned! Please confirm timing in this thread.`
3. Click `Assign` to set the contributor
4. Add to the Wave 5 tracking list in `BACKLOG_INDEX.md` if not present

### First-touch acknowledgment (within 4 hours)
If no reply in 4 hours, ping on the issue:
```
@<username> checking in — let me know if the scope matches your expectations or if you need clarification before starting.
```

---

## 3. Communication Cadence

| Day | Action |
|-----|--------|
| 0 (assignment) | Confirm receipt + timing |
| 2 | Check for initial questions/plan |
| 5 | Ensure progress or provide unblock help |
| 10 | Mid-point check: PRs expected soon |
| 14+ | Daily ping if no response (see below) |

### Daily unresponsive protocol
Starting day 14, ping every 24 hours:
```
@<username> status check — please share a draft PR or let us know if you need more time. Wave 5 cutoff is approaching.
```

Close issue after 7 consecutive days of no response.

---

## 4. Scope Decisions

### Split an issue when
- More than 4 acceptance criteria (too much work)
- More than 3 file/module touches (cross-cutting)
- Contributor asks for scope reduction

**Action**: Comment with proposed split, create new issue file in `maintainer/issues/`, link both.

### Close an issue when
- No activity from assigned contributor for >7 days after pings
- Contributor indicates inability to complete (no replacement)

**Action**: Remove `Stellar Wave` label, comment: "Closing — please re-open if you plan to resume."

### Roll over to next wave when
- Wave 5 deadline passed (check `WAVE_5_ROADMAP.md`)
- Issue is partially complete but unmerged

**Action**: Link to new roadmap, remove `Stellar Wave`, add to next wave backlog.

---

## 5. Post-Assignment Verification

Within 1 week, verify:
- [ ] Contributor has forked the repo
- [ ] Draft PR or branch exists with meaningful commits
- [ ] Questions are being answered within 24 hours by maintainer

If all fail, initiate unresponsive protocol above.