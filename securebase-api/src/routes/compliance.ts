import { Router, Request, Response } from 'express';
import { supabase } from '../server.js';

const router = Router();

router.get('/summary', async (req: Request, res: Response) => {
  try {
    const { data: evaluations, error } = await supabase
      .from('compliance_evaluations')
      .select('*');

    if (error) {
      console.error('Supabase query error:', error);
      return res.status(500).json({ 
        error: 'Failed to fetch compliance summary', 
        details: error.message,
        code: error.code 
      });
    }

    return res.status(200).json({
      status: 'success',
      source: 'database',
      data: evaluations || [],
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

export default router;