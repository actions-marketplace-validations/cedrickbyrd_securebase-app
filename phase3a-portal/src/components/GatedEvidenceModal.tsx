import React, { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://dvmuaivsbtrykqsnrtnv.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Initialize client with auth persistence disabled to avoid LockManager errors
const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

interface GatedEvidenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDownload: () => void;
}

export const GatedEvidenceModal: React.FC<GatedEvidenceModalProps> = ({
  isOpen,
  onClose,
  onDownload,
}) => {
  const [email, setEmail] = useState('');
  const [organization, setOrganization] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !organization) {
      setError('Please provide work email and organization name.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const params = new URLSearchParams(window.location.search);

    try {
      console.log('[SecureBase] Attempting lead insertion into Supabase:', { email, organization });
      
      const { data, error: dbError } = await supabase.from('gated_evidence_leads').insert([
        {
          ciso_email: email,
          organization_name: organization,
          framework_scope: 'FFIEC,HIPAA,SOC2,TX-RAMP',
          utm_source: params.get('utm_source') || 'direct',
          utm_campaign: params.get('utm_campaign') || 'unassigned',
          utm_content: params.get('utm_content') || 'anonymous',
          user_agent: navigator.userAgent,
        },
      ]).select();

      if (dbError) {
        console.error('[SecureBase Lead Ingestion Error Details]:', dbError);
        setError(`DB Error: ${dbError.message}`);
      } else {
        console.log('[SecureBase Lead Ingestion Success]:', data);
      }

      onDownload();
      onClose();
    } catch (err) {
      console.error('[SecureBase Modal Submission Exception]:', err);
      setError('An unexpected error occurred.');
      onDownload();
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl text-slate-100">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-slate-400 hover:text-slate-200"
        >
          ✕
        </button>

        <div className="mb-4">
          <span className="inline-block rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-400 border border-emerald-500/20">
            SHA-256 Signed Evidence Export
          </span>
          <h2 className="mt-2 text-xl font-bold">Generate Audit Evidence Packet</h2>
          <p className="mt-1 text-xs text-slate-400">
            Access your cryptographically verified continuous audit evidence package mapped to FFIEC, HIPAA, and SOC 2 Type II controls.
          </p>
        </div>

        {error && (
          <div className="mb-3 rounded-md bg-red-500/10 p-2 text-xs text-red-400 border border-red-500/20">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300">
              CISO / Executive Work Email
            </label>
            <input
              type="email"
              required
              placeholder="ciso@bank.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300">
              Organization Name
            </label>
            <input
              type="text"
              required
              placeholder="Citizens National Bank"
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-md bg-emerald-600 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 transition-all hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:opacity-50"
          >
            {isSubmitting ? 'Verifying Credentials...' : 'Export Verified Evidence Packet (.ZIP)'}
          </button>
        </form>

        <p className="mt-3 text-center text-[10px] text-slate-500">
          Zero Data Custody Guarantee: SecureBase reads read-only telemetry only. No financial data is accessed.
        </p>
      </div>
    </div>
  );
};