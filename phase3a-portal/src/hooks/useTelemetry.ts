import { useEffect, useCallback } from 'react';

export interface TelemetryPayload {
  eventType: 'pr_click' | 'email_open' | 'cta_click' | 'page_view';
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string; // Account slug (e.g. citizens_national_bank, trinetx)
  utmTerm?: string;    // Target persona (e.g. ciso, cto)
  metadata?: Record<string, unknown>;
}

export const useTelemetry = () => {
  const getUtmParams = useCallback(() => {
    if (typeof window === 'undefined') return {};
    const params = new URLSearchParams(window.location.search);
    return {
      utmSource: params.get('utm_source') || undefined,
      utmMedium: params.get('utm_medium') || undefined,
      utmCampaign: params.get('utm_campaign') || undefined,
      utmContent: params.get('utm_content') || undefined,
      utmTerm: params.get('utm_term') || undefined,
    };
  }, []);

  const trackEvent = useCallback(
    async (payload: TelemetryPayload) => {
      const utmParams = getUtmParams();
      const fullPayload = {
        ...utmParams,
        ...payload,
        timestamp: new Date().toISOString(),
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
        referrer: typeof document !== 'undefined' ? document.referrer : '',
      };

      try {
        await fetch('/api/v1/telemetry/lead-capture', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(fullPayload),
        });
      } catch (error) {
        console.error('[SecureBase Telemetry] Dispatch failed:', error);
      }
    },
    [getUtmParams]
  );

  useEffect(() => {
    // Record initial page view on mount
    trackEvent({ eventType: 'page_view' });
  }, [trackEvent]);

  return { trackEvent };
};