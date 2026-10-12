import { Router, Request, Response } from 'express';
import { supabase } from '../server.js'; // Adjust path if server.ts is at src/server.ts

const router = Router();

router.get('/summary', async (req: Request, res: Response) => {
  try {
    // Replace 'compliance_summaries' with your active Supabase table name
    const { data, error } = await supabase
      .from('compliance_summaries')
      .select('*')
      .limit(1);

    if (error) {
      console.error('Supabase query error:', error);
      return res.status(500).json({ error: 'Failed to fetch compliance summary' });
    }

    return res.status(200).json({
      status: 'success',
      data: data || [],
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

export default router;