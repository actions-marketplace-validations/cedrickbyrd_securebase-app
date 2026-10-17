import React, { useState, useEffect } from 'react';
import { fetchData } from '../utils/fetchData';
import { logoutDemo } from '../services/jwtService';

export default function DemoDashboard() {
  const [downloading, setDownloading] = useState(false);
  const [metrics, setMetrics] = useState(null);

  useEffect(() => {
    document.title = 'Demo-Dashboard';
    fetchData('/metrics').then(setMetrics);
  }, []);

  const handleDownloadReport = () => {
    setDownloading(true);
    
    setTimeout(() => {
      // Create HTML report
      const htmlContent = generateReportHTML();
      const blob = new Blob([htmlContent], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `SecureBase-SOC2-Report-${new Date().toISOString().split('T')[0]}.html`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      setDownloading(false);
    }, 2000);
  };

  const handleLogout = async () => {
    await logoutDemo();
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = '/login';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Demo Banner */}
      <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">🎯 Demo Environment</span>
            <div className="flex gap-3">
              <a
                href="https://securebase.tximhotep.com/pricing"
                className="bg-white text-purple-600 px-4 py-2 rounded-md text-sm font-medium"
              >
                Start Free Trial
              </a>
              <button
                onClick={handleLogout}
                className="bg-purple-800 text-white px-4 py-2 rounded-md text-sm"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-2">Demo-Dashboard</h1>
        <p className="text-gray-600 mb-8">
          Acme Corporation • FinTech Tier
          <span className="text-gray-400 text-sm"> · Explore dashboards below to see other compliance tiers</span>
        </p>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-6 mb-8">
          <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-6">
            <div className="text-4xl mb-2">🏗️</div>
            <div className="text-3xl font-bold mb-1 text-slate-900">3</div>
            <div className="text-sm font-semibold text-slate-700">Environments</div>
          </div>
          <div className="bg-green-50 border-2 border-green-200 rounded-lg p-6">
            <div className="text-4xl mb-2">✅</div>
            <div className="text-3xl font-bold mb-1 text-slate-900">{metrics?.soc2Score ?? 94}%</div>
            <div className="text-sm font-semibold text-slate-700">SOC 2 Compliance</div>
          </div>
          <div className="bg-purple-50 border-2 border-purple-200 rounded-lg p-6">
            <div className="text-4xl mb-2">💰</div>
            <div className="text-3xl font-bold mb-1 text-slate-900">\$8,247</div>
            <div className="text-sm font-semibold text-slate-700">Monthly Cost</div>
          </div>
          <div className="bg-indigo-50 border-2 border-indigo-200 rounded-lg p-6">
            <div className="text-4xl mb-2">🛡️</div>
            <div className="text-3xl font-bold mb-1 text-slate-900">A+</div>
            <div className="text-sm font-semibold text-slate-700">Security Score</div>
          </div>
        </div>

        {/* HIPAA Dashboard Entry Point */}
        <a
          href="/hipaa-dashboard"
          aria-label="Navigate to HIPAA Dashboard"
          className="block bg-gradient-to-r from-rose-50 to-red-50 border-2 border-rose-300 rounded-xl p-6 mb-6 hover:from-rose-100 hover:to-red-100 hover:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-500 focus-within:border-rose-500 transition-colors"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="text-4xl">🏥</span>
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <div className="text-xl font-bold text-rose-800">HIPAA Dashboard</div>
                  <span className="text-xs font-semibold bg-rose-100 text-rose-700 border border-rose-300 px-2 py-0.5 rounded-full">Healthcare Tier</span>
                </div>
                <div className="text-sm text-rose-600">Healthcare compliance controls, PHI audit trail &amp; risk assessment</div>
              </div>
            </div>
            <span className="bg-rose-600 text-white px-5 py-2 rounded-lg font-semibold text-sm hover:bg-rose-700">
              View Dashboard →
            </span>
          </div>
        </a>

        {/* Compliance Entry Point */}
        <a
          href="/compliance"
          aria-label="Navigate to SOC 2 Compliance"
          className="block bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-300 rounded-xl p-6 mb-8 hover:from-green-100 hover:to-emerald-100 hover:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus-within:border-green-500 transition-colors"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="text-4xl">✅</span>
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <div className="text-xl font-bold text-slate-900">Banking & Regulatory Governance</div>
                  <span className="text-xs font-semibold bg-cyan-100 text-cyan-800 border border-cyan-300 px-2.5 py-0.5 rounded-full">FFIEC · Texas DOB · SOC 2</span>
                </div>
                <div className="text-sm text-slate-600">5/5 Texas DOB controls (7 TAC 33), 8/9 FFIEC domains & KMS cryptographic proof</div>
              </div>
            </div>
            <span className="bg-green-600 text-white px-5 py-2 rounded-lg font-semibold text-sm hover:bg-green-700">
              View Compliance →
            </span>
          </div>
        </a>

        {/* Main Report Card */}
        <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-xl shadow-xl p-8 mb-8 border-2 border-blue-200">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h2 className="text-2xl font-bold mb-4">📊 SOC 2 Compliance Report</h2>
              <ul className="space-y-2 mb-4">
                <li className="flex items-center">
                  <span className="text-green-500 mr-2">✓</span>
                  197 of 209 controls implemented
                </li>
                <li className="flex items-center">
                  <span className="text-green-500 mr-2">✓</span>
                  All critical findings resolved
                </li>
                <li className="flex items-center">
                  <span className="text-yellow-500 mr-2">⚠</span>
                  12 minor recommendations
                </li>
              </ul>
            </div>
            <button
              onClick={handleDownloadReport}
              disabled={downloading}
              className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-8 py-4 rounded-lg font-semibold text-lg hover:from-blue-700 hover:to-purple-700 disabled:opacity-50"
            >
              {downloading ? 'Generating...' : 'Download Report'}
            </button>
          </div>
        </div>

        {/* Environments */}
        <div className="grid grid-cols-3 gap-6">
          {['Production', 'Staging', 'Development'].map((env, i) => (
            <div key={env} className="bg-white border-2 rounded-lg p-6">
              <h3 className="text-lg font-bold mb-4 text-slate-900">{env}</h3>
              <div className="space-y-2 text-sm text-slate-700">
                <div className="flex justify-between">
                  <span>Region:</span>
                  <span className="font-medium text-slate-900">us-east-1</span>
                </div>
                <div className="flex justify-between">
                  <span>Resources:</span>
                  <span className="font-medium text-slate-900">{47 - i * 5}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function generateReportHTML() {
  const date = new Date().toISOString().split('T')[0];
  return `<!DOCTYPE html>
<html>
<head>
  <title>SOC 2 Compliance Report</title>
  <style>
    body { font-family: Arial; max-width: 800px; margin: 40px auto; padding: 20px; }
    .header { text-align: center; border-bottom: 3px solid #4F46E5; padding-bottom: 20px; }
    h1 { color: #1F2937; }
    .metric { background: #F3F4F6; padding: 15px; margin: 10px 0; border-left: 4px solid #10B981; }
  </style>
</head>
<body>
  <div class="header">
    <h1>SOC 2 Type II Compliance Report</h1>
    <h2>Acme Corporation</h2>
    <p>Generated: ${date}</p>
  </div>
  <div class="metric">
    <h3>Overall Compliance: 94%</h3>
    <p>197 of 209 controls passed</p>
  </div>
  <h3>Infrastructure Coverage</h3>
  <ul>
    <li>3 AWS Environments</li>
    <li>127 Total Resources</li>
    <li>CloudTrail: Enabled</li>
    <li>GuardDuty: Active</li>
  </ul>
</body>
</html>`;
}