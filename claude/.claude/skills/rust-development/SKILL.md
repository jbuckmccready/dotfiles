---
name: rust-development
description: Instructions for working on Rust projects. This skill applies when working on Rust projects and needing to format, lint, test, or build Rust code.
---

# Development Commands

- **Fast Build Check**: `cargo check --tests` (checks compilation for everything including tests)
- **Build**: `cargo build`
- **Release Build**: `cargo build --release`
- **Test**: `cargo test`
- **Format**: `cargo +nightly fmt`
- **Lint**: `cargo clippy --tests` (runs clippy on everything including tests)
