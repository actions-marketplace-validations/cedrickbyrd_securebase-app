import { Router, Request, Response } from 'express';
import { supabase } from '../server.js';

const router = Router();

// GET /api/v1/compliance/summary
router.get('/summary', async (req: Request, res: Response) => {
  try {
    const { data: evaluations, error } = await supabase
      .from('compliance_evaluations')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Supabase query error:', error);
      return res.status(500).json({ 
        error: 'Failed to fetch compliance summary', 
        details: error.message,
        code: error.code 
      });
    }

    const latestEvaluations = Array.from(
      (evaluations || []).reduce((map, item) => {
        if (!map.has(item.tenant_id)) {
          map.set(item.tenant_id, item);
        }
        return map;
      }, new Map()).values()
    );

    return res.status(200).json({
      status: 'success',
      source: 'database',
      count: latestEvaluations.length,
      data: latestEvaluations,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// GET /api/v1/compliance/audit/ledger
router.get('/audit/ledger', async (req: Request, res: Response) => {
  try {
    const { data: evaluations, error } = await supabase
      .from('compliance_evaluations')
      .select('tenant_id, framework, overall_score, status, evaluation_metadata, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({
        error: 'Failed to fetch audit ledger',
        details: error.message
      });
    }

    const auditLedger = (evaluations || []).map((item) => ({
      tenant_id: item.tenant_id,
      framework: item.framework,
      event: 'COMPLIANCE_EVALUATION_RECORDED',
      score: item.overall_score,
      report_id: item.evaluation_metadata?.report_id || null,
      sha256_hash: item.evaluation_metadata?.sha256 || null,
      timestamp: item.created_at
    }));

    return res.status(200).json({
      status: 'success',
      source: 'database',
      count: auditLedger.length,
      ledger: auditLedger,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

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

export default router;