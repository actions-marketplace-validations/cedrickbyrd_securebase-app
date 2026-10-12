// src/routes/compliance.ts

router.get('/export', async (req: Request, res: Response) => {
  try {
    const { tenant_id, framework } = req.query;

    if (!tenant_id) {
      return res.status(400).json({ error: 'Missing tenant_id parameter' });
    }

    const tenantKey = tenant_id as string;

    // Query matching either 'id' or 'tenant_id'
    let query = supabase
      .from('compliance_summaries')
      .select('*')
      .or(`id.eq.${tenantKey},tenant_id.eq.${tenantKey}`);

    if (framework) {
      query = query.eq('framework', framework as string);
    }

    const { data: records, error } = await query;

    if (error || !records || records.length === 0) {
      console.error('Supabase query error or empty result:', error);
      return res.status(404).json({ error: 'Compliance record not found' });
    }

    const summary = records[0];
    const { evaluation_metadata } = summary;

    // Construct cryptographic audit package
    const manifestPayload = {
      tenant_id: summary.id || summary.tenant_id,
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

    const signature = crypto
      .createHmac('sha256', process.env.SUPABASE_SERVICE_ROLE_KEY || 'secret')
      .update(JSON.stringify(manifestPayload))
      .digest('hex');

    const exportBundle = {
      manifest: manifestPayload,
      signature,
      signature_algorithm: 'HMAC-SHA256'
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${tenantKey}_${summary.framework}_evidence_export.json"`
    );

    return res.status(200).send(JSON.stringify(exportBundle, null, 2));
  } catch (err: any) {
    console.error('Error generating evidence export:', err);
    return res.status(500).json({ error: 'Internal server error generating export package' });
  }
});
