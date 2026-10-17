// useTelemetry.ts
// Telemetry helper hook for phase3a-portal
// Captures PR click events and executive email lead-capture events
// Sends privacy-preserving telemetry to the API endpoint: /api/v1/telemetry/lead-capture

// Usage:
// const telemetry = useTelemetry();
// telemetry.trackPrClick({ repo: 'owner/repo', prNumber: 123, prUrl: 'https://github.com/...' });
// telemetry.trackExecutiveEmail({ email: 'exec@example.com', context: 'book_demo_cta' });

// Security & Privacy Notes:
// - Telemetry is disabled by default. Enable by setting VITE_TELEMETRY_ENABLED=true in build env.
// - Emails are hashed (HMAC-SHA256) using VITE_TELEMETRY_SALT. Do NOT embed secret salts in the repo.
// - Respects Do Not Track (navigator.doNotTrack) and local opt-out (localStorage: 'telemetry:optout' === '1').
// - No raw PII is sent; only hashed identifiers and event metadata.

type TelemetryEvent = {
  type: string;
  timestamp?: string;
  payload?: Record<string, any>;
};

type PrClickPayload = {
  repo: string;
  prNumber?: number | string;
  prUrl?: string;
  referrer?: string;
};

type ExecEmailPayload = {
  emailHash: string; // hashed/obfuscated
  context?: string; // where the email was captured (e.g., 'book_demo_cta')
  source?: string; // e.g., 'README_badge', 'PR_footer'
};

const TELEMETRY_ENABLED = typeof import.meta !== 'undefined' && (import.meta.env?.VITE_TELEMETRY_ENABLED === 'true' || (typeof process !== 'undefined' && (process.env?.VITE_TELEMETRY_ENABLED === 'true')));
const TELEMETRY_SALT = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_TELEMETRY_SALT) || (typeof process !== 'undefined' && process.env?.VITE_TELEMETRY_SALT) || '';
const API_BASE = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) || '';
const TELEMETRY_ENDPOINT = API_BASE ? `${API_BASE.replace(/\/$/, '')}/api/v1/telemetry/lead-capture` : '/api/v1/telemetry/lead-capture';

async function sha256Hex(input: string): Promise<string> {
  if (typeof window === 'undefined' || !window.crypto || !window.crypto.subtle) {
    // Fallback: very small, non-cryptographic hash to avoid sending raw data (not ideal)
    let h = 0;
    for (let i = 0; i < input.length; i++) h = (h << 5) - h + input.charCodeAt(i);
    return Math.abs(h).toString(16);
  }
  const enc = new TextEncoder();
  const data = enc.encode(input);
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hmacSha256Hex(key: string, message: string): Promise<string> {
  if (!key) return sha256Hex(message);
  if (!window?.crypto?.subtle) return sha256Hex(message);
  const enc = new TextEncoder();
  const keyData = enc.encode(key);
  const cryptoKey = await window.crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: { name: 'SHA-256' } },
    false,
    ['sign']
  );
  const signature = await window.crypto.subtle.sign('HMAC', cryptoKey, enc.encode(message));
  return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function isOptedOut(): boolean {
  try {
    if (typeof navigator !== 'undefined' && (navigator as any).doNotTrack === '1') return true;
  } catch (e) {
    // ignore
  }
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem('telemetry:optout') === '1') return true;
  } catch (e) {
    // ignore (e.g., SSR)
  }
  return false;
}

async function safeSend(event: TelemetryEvent) {
  if (!TELEMETRY_ENABLED) return;
  if (isOptedOut()) return;

  const body = {
    eventType: event.type,
    timestamp: event.timestamp || new Date().toISOString(),
    payload: event.payload || {},
    meta: {
      ua: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      origin: typeof location !== 'undefined' ? location.href : null,
    }
  };

  try {
    // Fire-and-forget: don't block UI. Use navigator.sendBeacon when available for reliability.
    const json = JSON.stringify(body);
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      try {
        const blob = new Blob([json], { type: 'application/json' });
        navigator.sendBeacon(TELEMETRY_ENDPOINT, blob);
        return;
      } catch (e) {
        // fallback to fetch
      }
    }

    await fetch(TELEMETRY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: json,
    });
  } catch (err) {
    // Swallow errors - telemetry must not break UX
    // Consider queueing to localStorage for retry on next session (not implemented here)
    // console.debug('Telemetry send failed', err);
  }
}

export function useTelemetry() {
  async function trackPrClick(args: { repo: string; prNumber?: number | string; prUrl?: string; referrer?: string }) {
    try {
      const payload: PrClickPayload = {
        repo: args.repo,
        prNumber: args.prNumber,
        prUrl: args.prUrl,
        referrer: args.referrer || (typeof document !== 'undefined' ? document.referrer : undefined),
      };
      await safeSend({ type: 'pr_click', payload });
    } catch (e) {
      // no-op
    }
  }

  async function trackExecutiveEmail(args: { email: string; context?: string; source?: string }) {
    try {
      // Always hash/hmac the email before sending
      const normalized = (args.email || '').trim().toLowerCase();
      const emailHash = TELEMETRY_SALT ? await hmacSha256Hex(TELEMETRY_SALT, normalized) : await sha256Hex(normalized);
      const payload: ExecEmailPayload = {
        emailHash,
        context: args.context,
        source: args.source,
      };
      await safeSend({ type: 'exec_email_lead', payload });
    } catch (e) {
      // no-op
    }
  }

  return { trackPrClick, trackExecutiveEmail, isEnabled: TELEMETRY_ENABLED && !isOptedOut() };
}

// Export standalone helpers for non-React usage
export async function trackPrClick(repo: string, prNumber?: number | string, prUrl?: string) {
  const t = useTelemetry();
  return t.trackPrClick({ repo, prNumber, prUrl });
}

export async function trackExecutiveEmail(email: string, context?: string, source?: string) {
  const t = useTelemetry();
  return t.trackExecutiveEmail({ email, context, source });
}
