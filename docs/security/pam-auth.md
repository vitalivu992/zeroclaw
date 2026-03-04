# PAM Authentication for the Gateway Portal

> **Status:** Available in builds compiled with `--features auth-pam` on Linux.
> Config-only enablement — no dashboard toggle. See `[gateway]` in `config-reference.md`.

## Overview

When `[gateway] pam_auth = true` is set, the ZeroClaw web portal requires users to
authenticate with their Linux system credentials (username + password) before accessing
the dashboard. The login form replaces the pairing-code prompt.

Credentials are validated against the host PAM stack. On success, a bearer token
(`zc_<hex>`) is issued and stored in the same `PairingGuard` token store used by
the pairing flow. All subsequent dashboard requests use this bearer token.

**Scope:** portal dashboard only. Webhook and API endpoints (`/webhook`, `/pair`,
`/api/*`) keep their existing auth (webhook secrets, pairing tokens).

## Prerequisites

| Requirement | Notes |
|---|---|
| Linux host | PAM is a Linux subsystem |
| `libpam-dev` installed | `sudo apt install libpam-dev` on Debian/Ubuntu |
| `auth-pam` Cargo feature | See build instructions below |

## Build Instructions

> **Important:** The `bootstrap.sh` script builds **without** PAM support by default.
> You must rebuild with the `auth-pam` feature to enable PAM authentication.

1. Install the PAM development library:

```bash
sudo apt install libpam-dev
```

2. Build with the `auth-pam` feature:

```bash
cargo build --release --locked --features auth-pam
```

3. Verify PAM is available after starting the gateway:

```bash
curl http://localhost:8080/health | jq '.pam_available'
# Should output: true
```

If you ran `bootstrap.sh` first, simply rebuild with the feature flag — there's no need to re-run the full bootstrap.

## Configuration

```toml
[gateway]
pam_auth    = true
pam_service = "login"   # optional; default is "login"
```

`pam_service` maps to `/etc/pam.d/<name>`. The default `"login"` works on most
Linux distributions without additional PAM config.

## Security Properties

- Credentials are validated inside the Rust process using `libpam`. They are never
  logged or persisted.
- Rate limiting and brute-force lockout reuse the existing pair rate limiter:
  10 attempts per minute per client IP, 5-minute lockout after 5 failures.
- Issued tokens follow the same lifecycle as pairing tokens: they are stored as
  SHA-256 hashes and can be revoked via the Devices dashboard page.
- Static assets (JS/CSS) remain publicly accessible so the login page loads without auth.

## Health Check

The `/health` endpoint always reports PAM status:

```json
{
  "pam_available": true,
  "pam_enabled": true
}
```

The frontend reads these flags on mount to decide which login form to show.

## Disabling

Set `pam_auth = false` (default) or omit the key. Existing pairing-code flow is
unaffected.
