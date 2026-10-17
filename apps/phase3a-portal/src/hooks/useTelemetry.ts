import { useCallback, useEffect, useRef } from 'react';

export type EventType = 'pr_click' | 'email_open' | 'cta_click' | 'page_view';

export interface TelemetryPayload {
  eventType: EventType | string;
  timestamp: string;
  userAgent: string | null;
  referrer: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  utmTerm?: string | null;
  metadata?: Record<string, any> | null;
}

const TELEMETRY_ENDPOINT = '/api/v1/telemetry/lead-capture';

export function useTelemetry() {
  const utmRef = useRef<{
    utmSource: string | null;
    utmMedium: string | null;
    utmCampaign: string | null;
    utmContent: string | null;
    utmTerm: string | null;
  }>({
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    utmContent: null,
    utmTerm: null,
  });

  const buildBasePayload = useCallback((): Omit<TelemetryPayload, 'eventType' | 'timestamp' | 'metadata'> => {
    return {
      // eventType and timestamp will be added by caller
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      referrer: typeof document !== 'undefined' ? document.referrer || null : null,
      utmSource: utmRef.current.utmSource,
      utmMedium: utmRef.current.utmMedium,
      utmCampaign: utmRef.current.utmCampaign,
      utmContent: utmRef.current.utmContent,
      utmTerm: utmRef.current.utmTerm,
    } as Omit<TelemetryPayload, 'eventType' | 'timestamp' | 'metadata'>;
  }, []);

  const sendPayload = useCallback(async (payload: TelemetryPayload) => {
    try {
      await fetch(TELEMETRY_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      // Do not block the app for telemetry failures; log for local debugging
      // eslint-disable-next-line no-console
      console.error('Failed to send telemetry', err);
    }
  }, []);

  // Exposed trackEvent function
  const trackEvent = useCallback(
    async (eventType: EventType | string, metadata?: Record<string, any> | null) => {
      const base = buildBasePayload();
      const payload: TelemetryPayload = {
        eventType,
        timestamp: new Date().toISOString(),
        userAgent: base.userAgent,
        referrer: base.referrer,
        utmSource: base.utmSource,
        utmMedium: base.utmMedium,
        utmCampaign: base.utmCampaign,
        utmContent: base.utmContent,
        utmTerm: base.utmTerm,
        metadata: metadata ?? null,
      };

      await sendPayload(payload);
    },
    [buildBasePayload, sendPayload]
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    utmRef.current.utmSource = params.get('utm_source');
    utmRef.current.utmMedium = params.get('utm_medium');
    utmRef.current.utmCampaign = params.get('utm_campaign');
    utmRef.current.utmContent = params.get('utm_content');
    utmRef.current.utmTerm = params.get('utm_term');

    // Automatically dispatch a page_view event on initialization
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    trackEvent('page_view', null);

    // No cleanup necessary; utmRef remains for future trackEvent calls
  }, [trackEvent]);

  return { trackEvent };
}
