import test from 'node:test';
import assert from 'node:assert/strict';
import { createPairingInvite, encodePairingInvite, parsePairingInvite } from '../.test-build/pairing.js';

test('invites are unique, parseable, and do not expose private keys', async () => {
    const a = await createPairingInvite();
    const b = await createPairingInvite();
    const text = encodePairingInvite(a.invite);
    assert.notEqual(a.invite.sessionId, b.invite.sessionId);
    assert.notEqual(a.invite.publicKey, b.invite.publicKey);
    assert.equal(parsePairingInvite(text).sessionId, a.invite.sessionId);
    assert.equal('privateKey' in JSON.parse(text), false);
    assert.equal(a.privateKey.extractable, false);
});

test('expired invitation is rejected', async () => {
    const invite = (await createPairingInvite(1000)).invite;
    assert.throws(() => parsePairingInvite(encodePairingInvite(invite), 122000), /expired/);
});

test('reject malformed or hostile QR input', async () => {
    const invite = (await createPairingInvite()).invite;
    assert.throws(() => parsePairingInvite('not a QR'), /valid/);
    assert.throws(() => parsePairingInvite('x'.repeat(3000)), /too long/);
    assert.throws(() => parsePairingInvite(JSON.stringify({ ...invite, protocol: 'other' })), /protocol/);
    assert.throws(() => parsePairingInvite(JSON.stringify({ ...invite, publicKey: 'abc' })), /public key/);
});
