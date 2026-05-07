// Pre-storage PII redaction. Called on every message we persist to chat_messages
// so transcripts don't accumulate raw PCI/SSN/etc. data. We deliberately let
// emails and phone numbers through because the agent needs them to help fill
// the quote — but we strip the obvious account-takeover-style payloads.

const PATTERNS: Array<{ name: string; re: RegExp; replacement: string }> = [
  // 13-19 digit card-like sequences (with spaces or dashes), Luhn-ish
  {
    name: 'card',
    re: /\b(?:\d[ -]*?){13,19}\b/g,
    replacement: '[redacted-card]',
  },
  // CVV-style triple/quadruple-digit "cvv: 123" or "cvc 1234"
  {
    name: 'cvv',
    re: /\b(?:cvv|cvc|cv2)\s*[:#]?\s*\d{3,4}\b/gi,
    replacement: '[redacted-cvv]',
  },
  // SSN
  {
    name: 'ssn',
    re: /\b\d{3}-\d{2}-\d{4}\b/g,
    replacement: '[redacted-ssn]',
  },
  // password / api key tokens — keep the label, drop the value
  {
    name: 'password',
    re: /\b(password|passwd|pwd|api[_-]?key|secret|bearer)\s*[:=]\s*\S+/gi,
    replacement: '$1: [redacted]',
  },
];

export function redact(text: string): string {
  let out = text;
  for (const { re, replacement } of PATTERNS) {
    out = out.replace(re, replacement);
  }
  return out;
}
