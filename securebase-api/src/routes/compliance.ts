// POST /api/v1/compliance/evaluations
router.post('/evaluations', async (req: Request, res: Response) => {
  try {
    const { tenant_id, framework, overall_score, status, passed_controls, total_controls, evaluation_metadata } = req.body;

    if (!tenant_id || !framework || overall_score === undefined) {
      return res.status(400).json({ error: 'Missing required evaluation fields: tenant_id, framework, overall_score' });
    }

    const { data, error } = await supabase
      .from('compliance_evaluations')
      .insert([
        {
          tenant_id,
          framework,
          overall_score,
          status: status || 'COMPLIANT',
          passed_controls: passed_controls || 0,
          total_controls: total_controls || 0,
          evaluation_metadata: evaluation_metadata || {}
        }
      ])
      .select();

    if (error) {
      console.error('Supabase insert error:', error);
      return res.status(500).json({ error: 'Failed to record evaluation', details: error.message });
    }

    return res.status(201).json({
      status: 'success',
      data: data[0],
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});