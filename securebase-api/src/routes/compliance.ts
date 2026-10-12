import { Router, Request, Response } from 'express';
import crypto from 'node:crypto';
import { supabase } from '../server.js';

const router = Router();

router.get('/export', async (req: Request, res: Response): Promise<void> => {
  try {
    const tenant_id = req.query.tenant_id as string | undefined;
    const framework = req.query.framework as string | undefined;

    if (!tenant_id) {
      res.status(400).json({ error: 'Missing tenant_id parameter' });
      return;
    }

    // 1. Fetch live evaluation summary from Supabase matching 'id' or 'tenant_id'
    let query = supabase
      .from('compliance_summaries')
      .select('*')
      .or(`id.eq.${tenant_id},tenant_id.eq.${tenant_id}`);

    if (framework) {
      query = query.eq('framework', framework);
    }

    const { data: records, error } = await query;

    if (error || !records || records.length === 0) {
      res.status(404).json({ error: 'Compliance record not found' });
      return;
    }

    const summary = records[0];
    const evaluation_metadata = summary.evaluation_metadata || {};

    // 2. Construct signed cryptographic audit package
    const manifestPayload = {
      tenant_id: summary.id || summary.tenant_id,
      framework: summary.framework,
      status: summary.status,
      overall_score: summary.overall_score,
      passed_controls: summary.passed_controls,
      total_controls: summary.total_controls,
      evidence_hash: evaluation_metadata.sha256 || null,
      report_id: evaluation_metadata.report_id || null,
      entity: evaluation_metadata.entity || null,
      exported_at: new Date().toISOString(),
      vault_reference: `s3://securebase-vault-logs/${evaluation_metadata.report_id || 'manifest.json'}`
    };

    const signature = crypto
      .createHmac('sha256', process.env.SUPABASE_SERVICE_ROLE_KEY || 'secret')
      .update(JSON.stringify(manifestPayload))
      .digest('hex');

    const exportBundle = {
      manifest: manifestPayload,
      signature,
      signature_algorithm: 'HMAC-SHA256'
    };

    // 3. Stream JSON evidence package
    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${tenant_id}_${summary.framework}_evidence_export.json"`
    );

    res.status(200).send(JSON.stringify(exportBundle, null, 2));
  } catch (err: unknown) {
    console.error('Error generating evidence export:', err);
    res.status(500).json({ error: 'Internal server error generating export package' });
  }
});

export default router;