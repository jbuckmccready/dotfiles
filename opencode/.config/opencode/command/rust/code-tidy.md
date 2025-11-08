---
description: Tidy up Rust code by running linter and formatter
---

1. Run linter: `cargo clippy --tests`
2. Fix any issues
3. Run linter again to confirm fixed: `cargo clippy --tests` (repeat as necessary)
4. Run formatter: `cargo +nightly fmt`

**IMPORTANT:** if there are no changes made to fix issues then do not run any tests.

After formatting only respond with "Code tidied."
