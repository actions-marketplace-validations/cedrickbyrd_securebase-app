import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import complianceRouter from './routes/compliance.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));

app.use(express.json());

// Target project URL
const supabaseUrl = process.env.SUPABASE_URL || 'https://dvmuaivsbtrykqsnrtnv.supabase.co';

// Resolve key prioritizing service role, then generic key, then fallback placeholder
const supabaseKey = 
  process.env.SUPABASE_SERVICE_ROLE_KEY || 
  process.env.SUPABASE_KEY || 
  process.env.SUPABASE_ANON_KEY || 
  'placeholder-key';

// Startup environment warnings
if (!process.env.SUPABASE_URL) {
  console.warn('⚠️ WARNING: SUPABASE_URL environment variable is missing.');
}

if (!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_KEY) {
  console.warn('⚠️ WARNING: SUPABASE_SERVICE_ROLE_KEY is missing. Database queries will fail.');
} else {
  console.log('✅ Supabase initialized with configured service key.');
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
  },
  global: {
    fetch,
  },
  realtime: {
    transport: ws as any,
  },
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date() });
});

// Mount compliance router
app.use('/api/v1/compliance', complianceRouter);

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`Server listening on port ${PORT}`);
});