import { useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

// Initialize zero-cost Supabase client using existing Netlify build env vars
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://dvmuaivsbtrykqsnrtnv.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const supabase`No rows returned` confirms that the SQL schema execution succeeded cleanly in Supabase. The `public.lead_telemetry_events` table and its anonymous `INSERT` RLS policy are active in your database (`dvmuaivsbtrykqsnrtnv.supabase.co`).

---

### Step 2: Push Supabase-Integrated `useTelemetry.ts`

Now update ⁠`phase3a-portal/src/hooks/useTelemetry.ts` to write incoming lead attribution directly to Supabase from the client:

```typescript
import { useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client using existing environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '[https://dvmuaivsbtrykqsnrtnv.supabase.co](https://dvmuaivsbtrykqsnrtnv.supabase.co)';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface TelemetryPayload {
  eventType: 'pr_click' | 'email_open' | 'cta_click' | 'page_view';
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string; // e.g. citizens_national_bank, trinetx
  utmTerm?: string;    // e.g. ciso, cto
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

      const record = {
        event_type: payload.eventType,
        account_slug: utmParams.utmContent || 'anonymous',
        target_persona: utmParams.utmTerm || 'unknown',
        utm_source: utmParams.utmSource || 'direct',
        utm_medium: utmParams.utmMedium || 'none',
        utm_campaign: utmParams.utmCampaign || 'unassigned',
        metadata: payload.metadata || {},
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
        referrer: typeof document !== 'undefined' ? document.referrer : '',
      };

      try {
        const { error } = await supabase.from('lead_telemetry_events').insert([record]);
        if (error) {
          console.error('[SecureBase Supabase Telemetry Error]:', error.message);
        }
      } catch (err) {
        console.error('[SecureBase Telemetry Exception]:', err);
      }
    },
    [getUtmParams]
  );

  useEffect(() => {
    trackEvent({ eventType: 'page_view' });
  }, [trackEvent]);

  return { trackEvent };
};