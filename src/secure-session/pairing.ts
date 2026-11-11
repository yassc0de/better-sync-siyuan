/**
 * QR pairing metadata. This module deliberately does NOT transmit notes or
 * authenticate a network peer. It is a foundation for a future secure transport.
 * No API token or document data should ever be placed into a QR invite.
 */
const PAIRING_PROTOCOL = "better-sync-lan-pair-v1";
const PAIRING_DURATION_MS = 120_000;

export interface PairingInvite {
    protocol: typeof PAIRING_PROTOCOL;
    sessionId: string;
    publicKey: string;
    expiresAt: number;
}

export interface PendingPairing {
    invite: PairingInvite;
    privateKey: CryptoKey;
}

function toBase64Url(bytes: Uint8Array): string {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
    if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Invalid base64url");
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
    return Uint8Array.from(binary, char => char.charCodeAt(0));
}

export async function createPairingInvite(now = Date.now()): Promise<PendingPairing> {
    if (!globalThis.crypto?.subtle) throw new Error("Web Crypto is unavailable in this context");
    const keys = await crypto.subtle.generateKey(
        { name: "ECDH", namedCurve: "P-256" },
        true,
        ["deriveBits"]
    );
    const rawPublicKey = new Uint8Array(await crypto.subtle.exportKey("raw", keys.publicKey));
    const nonce = crypto.getRandomValues(new Uint8Array(16));
    return {
        privateKey: keys.privateKey,
        invite: {
            protocol: PAIRING_PROTOCOL,
            sessionId: toBase64Url(nonce),
            publicKey: toBase64Url(rawPublicKey),
            expiresAt: now + PAIRING_DURATION_MS,
        },
    };
}

export function encodePairingInvite(invite: PairingInvite): string {
    return JSON.stringify(invite);
}

export function parsePairingInvite(payload: string, now = Date.now()): PairingInvite {
    if (payload.length > 2048) throw new Error("QR content is too long");
    let parsed: unknown;
    try { parsed = JSON.parse(payload); }
    catch { throw new Error("Not a valid pairing QR code"); }
    if (!parsed || typeof parsed !== "object") throw new Error("Invalid invite");
    const candidate = parsed as Record<string, unknown>;
    if (candidate.protocol !== PAIRING_PROTOCOL) throw new Error("Wrong pairing protocol");
    if (typeof candidate.sessionId !== "string" ||
        fromBase64Url(candidate.sessionId).length !== 16) {
        throw new Error("Invalid session ID");
    }
    if (typeof candidate.publicKey !== "string") throw new Error("Missing public key");
    const publicKey = fromBase64Url(candidate.publicKey);
    if (publicKey.length !== 65 || publicKey[0] !== 4) throw new Error("Invalid P-256 public key");
    if (typeof candidate.expiresAt !== "number" ||
        !Number.isSafeInteger(candidate.expiresAt) ||
        candidate.expiresAt <= now ||
        candidate.expiresAt > now + PAIRING_DURATION_MS + 30_000) {
        throw new Error("This QR code is expired or has an invalid validity period");
    }
    return {
        protocol: PAIRING_PROTOCOL,
        sessionId: candidate.sessionId,
        publicKey: candidate.publicKey,
        expiresAt: candidate.expiresAt,
    };
}
