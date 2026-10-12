import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

// CORS configuration for Netlify frontend
const allowedOrigins = [
  process.env.CORS_ORIGIN || '*',
  'http://localhost:5173'
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      callback(null, true);
    } else {
      callback(new Error('Blocked by CORS policy'));
    }
  },
  credentials: true
}));

app.use(express.json());

// Initialize Supabase admin client (Backend only)
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
export const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Health Check Endpoint (Required for Render Deploys)
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', timestamp: new Date() });
});

// Example API Route
app.get('/api/v1/status', async (req: Request, res: Response) => {
  try {
    // Optional: Test DB connection
    const { data, error } = await supabase.from('system_logs').select('count').limit(1);
    res.json({ success: true, message: 'API is connected to Supabase', data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Bind server to 0.0.0.0
app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`Server listening on port ${PORT}`);
});