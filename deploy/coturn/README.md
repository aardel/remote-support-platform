# TURN relay (coturn) — deployment notes

WebRTC media is peer-to-peer with STUN. TURN is the relay fallback for
customers behind NAT/firewalls where a direct connection can't form. This
deployment specifically routes TURN over **port 443** (shared with the web
sites via SNI) so it works through any firewall that allows web browsing —
no new customer-side ports or admin exceptions needed (matching how
TeamViewer/Zoom-style tools traverse restrictive corporate networks).

## Status: LIVE (as of 2026-07-03)
- coturn running, `turn.servicelc.com` DNS + Let's Encrypt cert issued.
- Edge (`edge-nginx`, the shared reverse proxy for all sites on this host) now
  splits port 443 by SNI: `turn.servicelc.com` → coturn, everything else →
  the existing web sites (unchanged).
- `/api/turn-servers` advertises `turns:turn.servicelc.com:443?transport=tcp`
  with time-limited credentials — this is the one publicly reachable path.
- Plain `3478`/`5349` listeners also run (for a future UDP fast-path/lower-
  latency option) but are **not** open to the public internet yet — only
  reachable internally (edge→coturn). Opening them publicly is a separate,
  deliberate step (see "Optional next step" below).

## What's deployed (server side, not in this repo)
- **coturn container** in `/srv/docker-compose.yml` (service `coturn`,
  `network_mode: host`, runs as root to read the Let's Encrypt private key).
- **Config** `/srv/coturn/turnserver.conf` — see `turnserver.conf.example` here
  (the live copy has the real `static-auth-secret`). Cert points at
  `/etc/letsencrypt/live/turn.servicelc.com/`.
- **Shared secret** `TURN_SECRET` + `TURN_URLS` in `/srv/.env`, passed to
  `remote-app`.
- **Edge split**: the shared `edge-nginx` (fronts ~7 unrelated sites, config
  not stored in this repo) has a `stream {}` block added: `ssl_preread` on
  443 routes by SNI — `turn.servicelc.com` → an internal PROXY-protocol-strip
  hop (coturn doesn't speak PROXY protocol) → coturn:5349; everything else →
  the web sites on an internal `127.0.0.1:8443` listener. `set_real_ip_from` +
  `real_ip_header proxy_protocol` restore true client IPs for all sites
  (verified: access logs show real IPs, not 127.0.0.1).

## App wiring (in this repo)
- `backend/server.js` → `GET /api/turn-servers` issues **time-limited
  credentials** (coturn REST API: `username = <expiry-unix>`,
  `credential = base64(HMAC-SHA1(secret, username))`).
- Helper (`helper/src/renderer/renderer.js`, `loadIceServers()`) and the viewer
  (`SessionView.jsx`) both fetch `/api/turn-servers` and use the returned
  `iceServers`. Falls back to public STUN if the fetch fails — no regression
  if TURN is ever unreachable.

## ⚠️ Docker bind-mount gotcha (learned the hard way)
`edge-nginx`'s `nginx.conf` is a **single-file, read-only bind mount**. Editing
it with `sed -i` (or any rename-based writer) creates a new inode — the
running container keeps referencing the *old* one, so `nginx -s reload`
silently keeps serving the pre-edit config with no error. **A full
`docker restart edge-nginx` is required** whenever this file changes (a few
seconds of full interruption across all sites on this edge — budget for it).
Always verify with `docker exec edge-nginx md5sum /etc/nginx/nginx.conf`
vs the host file after any edit + restart, before trusting `nginx -t`/`-T`.

## Verify
- Cert/routing: `openssl s_client -connect servicelc.com:443 -servername turn.servicelc.com`
  → `CN=turn.servicelc.com`. `-servername servicelc.com` → `CN=servicelc.com`.
- Real IPs preserved: check `docker logs edge-nginx` shows real client IPs, not
  `127.0.0.1`/`172.x`, for actual external requests.
- Full relay: run the app's normal session flow, or a Trickle-ICE test
  (`https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/`)
  with `turns:turn.servicelc.com:443?transport=tcp` + a credential from
  `/api/turn-servers`; expect a `relay` candidate.

## Optional next step: open 3478/5349 publicly too
Adds a lower-latency UDP fast path for customers on lenient networks (443-TCP
relay always works but has slightly higher latency than direct UDP TURN).
Requires opening `3478/udp,tcp`, `5349/tcp`, and the relay range
`49160-49200/udp` in the host firewall (ufw) and cloud security group, then
adding those URLs back to `TURN_URLS`. Deliberately deferred — the 443 path
alone already achieves "works through any firewall that allows web browsing."

## Security
coturn denies relaying to private/loopback ranges (`denied-peer-ip` for
RFC1918 + loopback + link-local) to prevent SSRF-style abuse; auth via
time-limited HMAC credentials only. The internal edge→coturn hop is
firewalled to the docker bridge range only (`172.16.0.0/12`), not public.
