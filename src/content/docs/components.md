---
title: Components
description: The crates that make up the freemkv toolchain and how they compose.
---

freemkv is a family of Rust crates. This page maps the pieces and links to the detailed page for each. The CLI and the autorip service are both thin front ends over one shared library.

## libfreemkv

The core engine. It owns the mapfile and multipass recovery model, sector-level retry, AACS and CSS decryption, and MKV muxing. Everything else consumes it.

Source on [GitHub](https://github.com/freemkv/libfreemkv) — the authoritative, current API. Consumed by git tag.

See the [library overview](/libfreemkv/).

## freemkv

The command-line front end, for Linux, macOS, and Windows. Every operation is a `scheme://` stream URL: rip a disc to MKV, copy a disc to an ISO, remux an existing image, inspect a disc, or refresh the key database.

See the [CLI reference](/cli/). Get a binary from the [Download](/download/) page.

## autorip

A cross-platform rip service (Linux, macOS, Windows). It auto-detects optical drives, runs the full sweep, patch, and mux pipeline on disc insert, and exposes a web UI for settings, live progress, and history. Resumable, with a configurable accepted-loss threshold. Runs as a single binary, or via Docker on Linux.

See the [autorip service](/autorip/). Published to GHCR at `ghcr.io/freemkv/autorip:latest`.

## freemkv-keysources

Pluggable AACS key sources for libfreemkv: a key database file or an online key service. This is how [decryption keys](/decryption-keys/) reach the decryption pipeline.

Source on [GitHub](https://github.com/freemkv/freemkv-keysources) — consumed by git tag.

## bdemu

A Blu-ray disc emulation component for testing the recovery and decryption paths without a physical disc in a drive.

## How they fit together

![How freemkv's components fit together: freemkv-keysources supplies keys to the libfreemkv engine (recovery, sector retry, AACS/CSS decrypt, MKV mux), which is composed by the freemkv CLI and the autorip service; bdemu is a test fixture.](/architecture.svg)

bdemu sits alongside as a test fixture for the recovery and decryption paths.
