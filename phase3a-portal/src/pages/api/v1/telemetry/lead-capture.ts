import type { NextApiRequest, NextApiResponse } from 'next';

export interface TelemetryRequestBody {
  eventType: 'pr_click' | 'email_open' | 'cta_click' | 'page_view';
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  metadata?: Record<string, unknown>;
  timestamp?: string;
  userAgent?: string;
  referrer?: string;
}

export interface TelemetryResponse {
  status: 'success' | 'error';
  message: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<TelemetryResponse>
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({
      status: 'error',
      message: `Method ${req.method} Not Allowed`,
    });
  }

  try {
    const {
      eventType,
      utmSource,
      utmMedium,
      utmCampaign,
      utmContent,
      utmTerm,
      metadata,
      timestamp,
      userAgent,
      referrer,
    }: TelemetryRequestBody = req.body;

    if (!eventType) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing required field: eventType',
      });
    }

    const telemetryRecord = {
      eventType,
      accountSlug: utmContent || 'anonymous',
      targetPersona: utmTerm || 'unknown',
      utmSource: utmSource || 'direct',
      utmMedium: utmMedium || 'none',
      utmCampaign: utmCampaign || 'unassigned',
      metadata: metadata || {},
      timestamp: timestamp || new Date().toISOString(),
      userAgent: userAgent || req.headers['user-agent'] || 'unknown',
      referrer: referrer || req.headers['referer'] || '',
      clientIp: req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown',
    };

    // Structured JSON log output for real-time log drains & ingestion
    console.log('[SecureBase Telemetry Ingestion]:', JSON.stringify(telemetryRecord));

    return res.status(200).json({
      status: 'success',
      message: 'Telemetry event recorded',
    });
  } catch (error) {
    console.error('[SecureBase Telemetry API Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Internal Server Error',
    });
  }
}