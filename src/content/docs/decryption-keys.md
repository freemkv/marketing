---
title: Decryption Keys
description: DVDs (CSS) decrypt with no setup. Blu-ray and 4K UHD (AACS) require keys you supply, from an online key service or a local keydb.cfg.
---

How freemkv decrypts a disc depends on its format: DVDs need nothing, while Blu-ray and 4K UHD need keys you supply.

## DVD

DVDs decrypt automatically. There are no keys to install and nothing to configure.

## Blu-ray and 4K UHD

| Format | Encryption |
|---|---|
| Blu-ray | AACS 1.0 |
| 4K UHD  | AACS 2.0 / 2.1 |

AACS-encrypted discs decrypt only when you supply AACS keys. No AACS keys are built in.
Provide them one of two ways: an online key service or a local `keydb.cfg`. Both autorip and
the `freemkv` CLI support either source.

:::note[You supply the keys]
freemkv ships with no AACS keys built in, and this website does not link to, host, or
recommend any specific online key service or key database. The options below describe the
mechanisms only; obtaining keys is up to you.
:::

## Online key service

A third-party web service looks up keys for an inserted disc on demand, so you don't
maintain a local file. Reach out on our support Discord for more information.

In **autorip**, enable the online key service and set its URL under **Settings**.
See [autorip Service](/autorip/#keys).

In the **CLI**, point at the service with `--key-url` (and `--key-auth` if it requires a
bearer token):

```bash
# resolve keys from an online key service — main title only
freemkv disc:// -t 1 mkv://Movie.mkv --key-url https://keys.example/keys

# with an authentication token
freemkv disc:// -t 1 mkv://Movie.mkv --key-url https://keys.example/keys --key-auth <TOKEN>
```

For title selection and source/destination behavior, see the [CLI reference](/cli/#scheme-details).

If you supply **both** `--key-url` and `--keydb`, the local keydb is consulted first
(local-first) and the service is only queried when the keydb has no key for the disc.
The URL is validated before any request, and freemkv refuses to send disc-key material to a
loopback, private, or cloud-metadata address.

## Local keydb.cfg

A `keydb.cfg` file on disk. It is the **single source of AACS truth** — no AACS keys are
compiled into the freemkv binary. The file holds the AACS material freemkv draws on to
unlock a disc: device keys (DKs), processing/player keys (PKs), host certificates for the
drive's secure handshake, and per-disc Volume Unique Key (VUK) entries.

By default the **CLI looks for it next to the `freemkv`
executable** — a `keydb.cfg` in the same folder as the program. freemkv is a portable,
self-contained binary, so its key database lives beside it rather than in an OS
configuration directory.

Refresh it from a URL with the **`update-keys`** command — see the
[CLI reference](/cli/) for the full syntax and supported formats (`.txt` / `.zip` /
`.gz`). The short version writes `keydb.cfg` next to the executable:

```bash
freemkv update-keys --url <KEYDB_URL>
```

The global **`--keydb`** flag points the CLI at a `keydb.cfg` anywhere — on
`update-keys` to **download** there, and on a rip to **read** from there:

```bash
freemkv update-keys --keydb /path/to/keydb.cfg --url <KEYDB_URL>   # download to a custom path
freemkv disc:// -t 1 mkv://Movie.mkv --keydb /path/to/keydb.cfg     # rip using it
```

**autorip** is a long-running service rather than a portable binary, so it uses the standard
config location `~/.config/freemkv/keydb.cfg` and can also download and refresh the file for
you from **Settings**. For the Docker image, bind-mount a host keys directory to
`/root/.config/freemkv` (see [autorip → Deploy](/autorip/#deploy)) so it persists across
restarts.

## When keys are missing

If you rip an AACS-encrypted disc with no key source configured, freemkv **fails loudly
and early** — a clear error message, non-zero exit, and no output file written. It never
writes a silently-encrypted or partially-decrypted file. autorip shows "no KEYDB.cfg
found" when no key source is available (whether because no local file exists or no online
service is configured). DVDs are never affected.
