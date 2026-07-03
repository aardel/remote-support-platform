# TURN relay (coturn) — deployment notes

WebRTC media is peer-to-peer with STUN. TURN is the relay fallback for the
~15% of customers behind NAT/firewalls where a direct connection can't form.

## What's deployed (server side, not in this repo)
- **coturn container** in `/srv/docker-compose.yml` (service `coturn`, `network_mode: host`,
  runs as root to read the Let's Encrypt private key for TURNS).
- **Config** `/srv/coturn/turnserver.conf` — see `turnserver.conf.example` here (the
  live copy has the real `static-auth-secret`).
- **Shared secret** `TURN_SECRET` in `/srv/.env`; also passed to `remote-app` along with
  `TURN_URLS`.

## App wiring (in this repo)
- `backend/server.js` → `GET /api/turn-servers` issues **time-limited credentials**
  (coturn REST API: `username = <expiry-unix>`, `credential = base64(HMAC-SHA1(secret, username))`).
- Helper (`helper/src/renderer/renderer.js`) and the viewer (`SessionView.jsx`) both fetch
  `/api/turn-servers` and use the returned `iceServers`. Falls back to public STUN if unreachable.

## Listeners
- `3478/udp,tcp` — STUN/TURN (plain)
- `5349/tcp` — TURNS (TLS) using the existing `servicelc.com` cert. Clients use
  `turns:servicelc.com:5349` → valid cert, no new DNS needed.
- Relay UDP range `49160-49200`.

## To make it reachable from customers (external steps)
1. **Firewall / cloud security group:** allow inbound `3478/udp`, `3478/tcp`, `5349/tcp`,
   and `49160-49200/udp`.
2. **(Optional, for 443-only networks)** add DNS `turn.servicelc.com → 173.249.10.40`,
   issue a cert (`certbot --webroot -w /srv/proxy/webroot -d turn.servicelc.com`), then
   front 443 with an nginx `stream` + `ssl_preread` SNI split (route `turn.servicelc.com`
   → coturn:5349, everything else → the web block via PROXY protocol to preserve client IPs).

## Verify
- `turns:servicelc.com:5349` cert: `openssl s_client -connect servicelc.com:5349` → CN=servicelc.com.
- Relay: Trickle-ICE test (`https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/`)
  with a URL + a credential from `/api/turn-servers`; expect a `relay` candidate.

## Security
coturn denies relaying to private/loopback ranges (`denied-peer-ip` for RFC1918 + loopback +
link-local) to prevent SSRF-style abuse; auth via time-limited HMAC credentials only.
