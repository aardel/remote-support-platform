# Security Settings

Date: 2026-03-03
Host: `servicelc.com` server

## Summary

This file documents the security hardening changes applied on the live server to reduce SSH exposure and add baseline host-audit tooling without changing application routing or container networking.

## Applied Changes

### SSH hardening

Effective policy now enforces:

- `PermitRootLogin prohibit-password`
- `AuthenticationMethods publickey` for `root`
- `PasswordAuthentication no` for `root`
- `KbdInteractiveAuthentication no`
- `MaxAuthTries 3`
- `ClientAliveInterval 300`
- `ClientAliveCountMax 2`
- `X11Forwarding no`

Files involved:

- `/etc/ssh/sshd_config`
- `/etc/ssh/sshd_config.d/99-servicelc-hardening.conf`

Reason:

- The server was internet-facing and previously allowed `root` SSH with password authentication enabled.
- That was reduced to key-only SSH for `root`.

### Firewall and brute-force protection

Verified active:

- `ufw`
- `fail2ban`
- `unattended-upgrades`

Confirmed public ports:

- `80/tcp`
- `443/tcp`
- `56789/tcp`

### Host scanning tools

Installed:

- `rkhunter`
- `chkrootkit`

Reason:

- The server did not previously have baseline rootkit-check tooling installed.

### Unneeded mail service disabled

During scanner installation, `postfix` was pulled in as a dependency.

Applied action:

- `postfix` disabled
- `postfix` masked

Reason:

- Mail transport is not part of the live app stack and should not remain enabled as extra attack surface.

## Verified Runtime Safety

The hardening work did not change:

- nginx app routing
- Docker published app ports
- container networking
- app environment variables
- app authentication flows

This means the changes should not affect normal runtime behavior for:

- Nextcloud
- Workspace / App Hub
- Upload app
- Remote support app
- CRM
- LC Studio
- Tripplanner
- Chat widget

## Current Security Posture

- Only `80`, `443`, and `56789` are exposed publicly.
- `edge-nginx` is the only internet-facing app container entrypoint.
- No privileged Docker containers were found during the audit.
- Automatic security updates are enabled.

## Remaining Recommendations

1. Create a named admin user and move away from direct `root` SSH usage.
2. Disable `root` SSH completely after the named admin user is confirmed working.
3. Apply the remaining pending package upgrades during a maintenance window.
4. Complete a second-pass audit for Docker secrets, mounted volumes, and app-level auth/session settings.

## Notes

- `rkhunter` and `chkrootkit` were installed successfully.
- Long-running scans may take time to complete on a live server.
- SSH was moved from `22` to `56789` to reduce low-effort scan noise. This is not a substitute for key-only auth, but is fine as an additional friction layer.
- If future administrators need to review the effective SSH policy, use:

```bash
sshd -T -C user=root -C host=servicelc.com -C addr=46.11.243.228
```
