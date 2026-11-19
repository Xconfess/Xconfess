# Package Distribution and License Policy

The repository treats package licenses as release metadata. `distribution-policy.json` is the policy source of truth.

## License classes

- **Allowed:** SPDX licenses in `allowedLicenses`, including MIT, Apache-2.0, BSD variants, ISC, 0BSD, MPL-2.0, Unlicense, and CC0-1.0.
- **Review required:** AGPL, GPL, LGPL, SSPL, BUSL, unknown, and unlicensed packages. Every unknown license is reviewed rather than silently approved.

## Audited ecosystems

The check covers every npm workspace declared at the repository root and every Rust package resolved by the `xconfess-contracts` workspace. It reports the ecosystem, package name, version, license, and disposition.

```bash
npm run packages:distribution
npm run packages:distribution -- --fail-on-review
npm run packages:distribution:self-test
```

The report is written to `PACKAGE_LICENSE_REPORT.md` and `package-license-report.json`. CI runs the policy self-test and reports review-required dependencies. A review-required license must be explicitly resolved by policy or dependency replacement before release.

The npm and Cargo lockfiles must remain committed and reviewed with every dependency change.
