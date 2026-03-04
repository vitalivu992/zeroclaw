//! Linux PAM authentication for the gateway portal.
//!
//! When the `auth-pam` feature is enabled (Linux only), this module validates
//! username/password credentials against the host PAM stack using the service
//! name configured in `[gateway] pam_service` (default: `"login"`).
//!
//! On non-Linux builds or when the feature is disabled the functions return
//! stub values so the rest of the codebase can compile without platform guards
//! at every call site.

// ── Feature-enabled implementation ──────────────────────────────────────────

#[cfg(feature = "auth-pam")]
mod inner {
    use anyhow::{bail, Result};
    use pam_client::{conv_mock::Conversation, Context, Flag};

    /// Returns `true` — PAM is available when the feature is compiled in.
    pub fn is_pam_available() -> bool {
        true
    }

    /// Authenticate `username` / `password` against the PAM `service`.
    ///
    /// Returns `Ok(())` on success, `Err` on authentication failure or PAM error.
    /// Credentials are never logged.
    pub fn authenticate(service: &str, username: &str, password: &str) -> Result<()> {
        if username.is_empty() || password.is_empty() {
            bail!("username and password must not be empty");
        }

        let mut ctx = Context::new(
            service,
            Some(username),
            Conversation::with_credentials(username, password),
        )
        .map_err(|e| anyhow::anyhow!("PAM context creation failed: {e}"))?;

        ctx.authenticate(Flag::NONE)
            .map_err(|_| anyhow::anyhow!("Authentication failed"))?;

        ctx.acct_mgmt(Flag::NONE)
            .map_err(|_| anyhow::anyhow!("Account validation failed"))?;

        Ok(())
    }
}

// ── Stub implementation for non-Linux or feature-disabled builds ─────────────

#[cfg(not(feature = "auth-pam"))]
mod inner {
    use anyhow::{bail, Result};

    /// Returns `false` — PAM is not available on this build.
    pub fn is_pam_available() -> bool {
        false
    }

    /// Always returns an error — PAM is not compiled in.
    pub fn authenticate(_service: &str, _username: &str, _password: &str) -> Result<()> {
        bail!("PAM authentication is not available on this build (compile with --features auth-pam on Linux)");
    }
}

// ── Public re-exports ────────────────────────────────────────────────────────

pub use inner::{authenticate, is_pam_available};

// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pam_available_returns_bool() {
        // The function must be callable regardless of platform/feature.
        // On Linux with auth-pam feature it returns true; otherwise false.
        let available = is_pam_available();
        #[cfg(feature = "auth-pam")]
        assert!(available, "auth-pam feature should report PAM as available");
        #[cfg(not(feature = "auth-pam"))]
        assert!(!available, "stub should report PAM as unavailable");
    }

    #[test]
    fn authenticate_rejects_empty_credentials() {
        // Both stub and real implementation must reject empty credentials.
        assert!(
            authenticate("login", "", "password").is_err(),
            "empty username must be rejected"
        );
        assert!(
            authenticate("login", "user", "").is_err(),
            "empty password must be rejected"
        );
    }
}
