# Wave 5 — Ready for Review Comment Template

Use this template when your Wave 5 pull request is ready for maintainer review.
Copy and paste the block below into a comment on the relevant issue.

---

```markdown
## ✅ Ready for Review

**PR:** <!-- paste your PR link here -->

### What changed
<!-- one or two sentences summarising the change -->

### Tests run
- [ ] `npm run build` passes locally
- [ ] `npm run lint` passes locally
- [ ] Manual smoke test completed (describe below)
- [ ] Other: <!-- list any additional checks -->

### Smoke test notes
<!-- brief steps you followed to verify the change works -->

### Screenshots / evidence
<!-- paste screenshots, screen recordings, or terminal output if relevant -->
<!-- for doc-only changes, a link to the rendered markdown is fine -->

### Checklist
- [ ] Branch is up to date with `main`
- [ ] No unrelated changes included
- [ ] Commit messages follow conventional format
- [ ] Sensitive data (tokens, secrets, emails) redacted from logs
```

---

## Tips for contributors

1. **Keep it short.** Reviewers scan quickly — bullet points beat paragraphs.
2. **Attach evidence.** Screenshots or a short video reduce back-and-forth.
3. **Link the issue.** Reference the issue number in your PR description so it auto-closes.
4. **Run CI locally first.** Fix lint and build errors before pushing.
5. **Be patient.** Maintainers review in batches; a polite bump after 48 hours is fine.
