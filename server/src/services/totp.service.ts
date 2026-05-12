// Minimal RFC 6238 TOTP implementation. Avoids pulling in otplib/speakeasy
// for a 60-line algorithm. Uses HMAC-SHA1 (the de-facto authenticator-app
// standard) with a 30-second step and 6-digit codes.

import crypto from 'crypto';
import QRCode from 'qrcode';

const STEP_SECONDS = 30;
const DIGITS = 6;
// Accept one step on either side so a code generated right before a step
// boundary still verifies. ±30s window total.
const WINDOW = 1;

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
  }
  return out;
}

function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/g, '').replace(/\s/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error(`Invalid base32 character: ${ch}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function generateSecret(): string {
  // 20 bytes = 160 bits of entropy = recommended by RFC 4226.
  return base32Encode(crypto.randomBytes(20));
}

function hotp(secret: string, counter: number): string {
  const key = base32Decode(secret);
  const buf = Buffer.alloc(8);
  // 8-byte big-endian counter
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binCode =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  const code = (binCode % 10 ** DIGITS).toString().padStart(DIGITS, '0');
  return code;
}

export function verifyTotp(secret: string, providedCode: string): boolean {
  const cleaned = (providedCode || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(cleaned)) return false;
  const now = Math.floor(Date.now() / 1000);
  const step = Math.floor(now / STEP_SECONDS);
  for (let w = -WINDOW; w <= WINDOW; w++) {
    const expected = hotp(secret, step + w);
    // Constant-time compare to avoid trivial timing attacks.
    if (
      expected.length === cleaned.length &&
      crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(cleaned))
    ) {
      return true;
    }
  }
  return false;
}

// otpauth:// URI used by authenticator apps + QR codes.
export function buildOtpauthUri(opts: { label: string; issuer: string; secret: string }): string {
  const label = encodeURIComponent(`${opts.issuer}:${opts.label}`);
  const params = new URLSearchParams({
    secret: opts.secret,
    issuer: opts.issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

export async function buildQrDataUrl(otpauthUri: string): Promise<string> {
  return QRCode.toDataURL(otpauthUri, { errorCorrectionLevel: 'M', margin: 1, scale: 6 });
}

// Recovery codes — single-use 8-char codes the user prints/saves so they can
// log in if they lose their authenticator. Generated alongside TOTP setup.
export function generateRecoveryCodes(count = 10): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const raw = crypto.randomBytes(5).toString('hex'); // 10 hex chars
    codes.push(`${raw.slice(0, 5)}-${raw.slice(5)}`);
  }
  return codes;
}
