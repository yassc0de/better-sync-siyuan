# One-time LAN QR sync: design and security status

## User experience (target)

1. Both SiYuan installations contain their own complete offline copies.
2. User taps **Sync** on either device, QR appears, the other SiYuan plugin scans it.
3. A short-lived, authenticated and end-to-end encrypted connection exchanges both sets of changes **over the LAN only**.
4. Both sides acknowledge success; the connection and listener close. No background network access and no automatic sync.

## Implemented on this branch (prototype)

- QR code invitation carrying a fresh, ephemeral ECDH P-256 public key, random 128-bit session ID, version and two-minute expiry. No SiYuan API token and no notes in the QR.
- On-demand SiYuan Dialog with QR generation and Android/WebView camera scanning where BarcodeDetector is supported; text fallback otherwise.
- Validation of expiration, size, protocol version and public key shape.
- A fail-closed **no-transfer** gate in the old sync handler. Startup, shutdown, instant and WebSocket sync are disabled; global fetch interception is no longer installed.

**No network handshake or note transfer takes place on this branch. Pairing is NOT complete. E2EE is NOT implemented.**

## Blocking research before enabling transport

The upstream plugin uses raw HTTP requests to the remote SiYuan API with an API token. Sending that long-lived token in a QR (or using HTTP inside a supposedly encrypted session) is forbidden.

We must prove that a **plugin-only** deployment can provide temporary local signaling and a connection endpoint on macOS AND Android, without a companion app or internet service. If the Android plugin runtime cannot expose a safe temporary endpoint or use a platform-provided secure channel, report that technical limit rather than weakening the guarantee.

Only after that proof:
- Return the scanned peer's public key via signaling.
- Confirm a matching short authentication code on BOTH devices before any transfer.
- Derive directional keys via a standard HKDF-based construction, encrypt and authenticate all frames, including metadata. Reject replays.
- Build an encrypted RPC adapter for every remote file/API operation; never fall back to legacy HTTP.
- Validate conflicts, independent offline edits, deletes, rollback, session cancellation, Wi-Fi loss, and recovery.
- Close all sockets, revoke temporary authorization and clear private keys on completion or failure.

## Testing and caution

Run `npm run test:pairing` to test QR invite generation and parsing. These tests do NOT establish transport security or sync correctness. Use disposable test workspaces only and back up your notes. Better Sync's pre-existing sync engine can lose or overwrite data.

This branch should not be merged as a working sync feature yet.
