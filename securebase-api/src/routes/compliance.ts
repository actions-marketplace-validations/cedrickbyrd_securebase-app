import { Router, Request, Response } from 'express';
import { supabase } from '../server.js';

const router = Router();

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

    // Filter to retain only the latest record per tenant_id
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

export default router;