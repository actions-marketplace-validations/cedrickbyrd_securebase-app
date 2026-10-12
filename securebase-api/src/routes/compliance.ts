import { Router, Request, Response } from 'express';
import { supabase } from '../server.js';
import crypto from 'crypto';

const router = Router();

// GET /api/v1/compliance/export?tenant_id=cnb-waxahachie&framework=FFIEC
router.get('/export', async (req: Request, res: Response) => {
  try {
    const { tenant_id, framework } = req.query;

    if (!tenant_id) {
      return res.status(400).json({ error: 'Missing tenant_id parameter' });
    }

    // 1. Fetch live evaluation summary from Supabase
    let query = supabase
      .from('compliance_summaries')
      .select('*')
      .eq('id', tenant_id as string);

    if (framework) {
      query = query.eq('framework', framework as string);
    }

    const { data: records, error } = await query;

    if (error || !records || records.length === 0) {
      return res.status(404).json({ error: 'Compliance record not found' });
    }

    const summary = records[0];
    const { evaluation_metadata } = summary;

    // 2. Construct signed cryptographic audit manifest
    const manifestPayload = {
      tenant_id: summary.id,
      framework: summary.framework,
      status: summary.status,
      overall_score: summary.overall_score,
      passed_controls: summary.passed_controls,
      total_controls: summary.total_controls,
      evidence_hash: evaluation_metadata?.sha256 || null,
      report_id: evaluation_metadata?.report_id || null,
      entity: evaluation_metadata?.entity || null,
      exported_at: new Date().toISOString(),
      vault_reference: `s3://securebase-vault-logs/${evaluation_metadata?.report_id || 'manifest.json'}`
    };

    // Calculate cryptographic signature over manifest payload
    const signature = crypto
      .createHmac('sha256', process.env.SUPABASE_SERVICE_ROLE_KEY || 'secret')
      .update(JSON.stringify(manifestPayload))
      .digest('hex');

    const exportBundle = {
      manifest: manifestPayload,
      signature,
      signature_algorithm: 'HMAC-SHA256'
    };

    // 3. Set download headers for JSON evidence package
    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${summary.id}_${summary.framework}_evidence_export.json"`
    );

    return res.status(200).send(JSON.stringify(exportBundle, null, 2));
  } catch (err: any) {
    console.error('Error generating evidence export:', err);
    return res.status(500).json({ error: 'Internal server error generating export package' });
  }
});

export default router;