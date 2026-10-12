import React, { useState, useEffect } from 'react';
import { Line } from 'react-chartjs-2';
import { ComplianceExportButton, handleDownloadEvidenceExport } from './ComplianceExportButton';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { mockAPI, complianceScoreHistory, mockControls } from '../mock-api';
import { ComplianceEvents } from '../utils/analytics';
import { usePostScanFlow } from '../hooks/usePostScanFlow';
import {
  ScanCompleteCheck,
  FindingsToast,
  CTABanner,
  ComparisonBanner,
} from './PostScanResults';

// Register Chart.js components once at module level (Architect's note: required
// for react-chartjs-2; omitting this causes blank chart renders).
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

// ---------------------------------------------------------------------------
// Error Boundary
// ---------------------------------------------------------------------------
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-lg bg-red-50 border border-red-200 p-6 text-center">
          <p className="text-red-700 font-semibold mb-1">Something went wrong</p>
          <p className="text-red-500 text-sm">{this.state.error?.message}</p>
        </div>
      );
    }
    return this.props.children;
  }
}

// ---------------------------------------------------------------------------
// Skeleton loaders — match the grid layout to avoid CLS
// ---------------------------------------------------------------------------
function ScoreCardSkeleton() {
  return (
    <div className="bg-white shadow-lg rounded-lg p-5 animate-pulse" aria-hidden="true">
      <div className="h-3 bg-slate-200 rounded w-24 mb-4" />
      <div className="h-10 bg-slate-200 rounded w-16 mb-3" />
      <div className="flex gap-2">
        <div className="h-3 bg-slate-200 rounded w-12" />
        <div className="h-3 bg-slate-200 rounded w-12" />
        <div className="h-3 bg-slate-200 rounded w-12" />
      </div>
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="bg-white shadow-lg rounded-lg p-6 animate-pulse" aria-hidden="true">
      <div className="h-4 bg-slate-200 rounded w-48 mb-6" />
      <div className="h-64 md:h-96 bg-slate-100 rounded" />
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="bg-white shadow-lg rounded-lg p-6 animate-pulse" aria-hidden="true">
      <div className="h-4 bg-slate-200 rounded w-32 mb-4" />
      <div className="flex gap-2 mb-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-8 bg-slate-200 rounded w-20" />
        ))}
      </div>
      {[...Array(5)].map((_, i) => (
        <div key={i} className="h-12 bg-slate-100 rounded mb-2" />
      ))}
    </div>
  );
}

function SidebarSkeleton() {
  return (
    <div className="bg-white shadow-lg rounded-lg p-6 animate-pulse" aria-hidden="true">
      <div className="h-4 bg-slate-200 rounded w-28 mb-4" />
      {[...Array(3)].map((_, i) => (
        <div key={i} className="h-10 bg-slate-200 rounded mb-3" />
      ))}
      <div className="h-px bg-slate-100 my-4" />
      <div className="h-3 bg-slate-200 rounded w-36 mb-2" />
      <div className="h-3 bg-slate-200 rounded w-32" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Severity & status badge helpers
// ---------------------------------------------------------------------------
const SEVERITY_STYLES = {
  critical: 'bg-red-100 text-red-700',
  high:     'bg-orange-100 text-orange-700',
  medium:   'bg-yellow-100 text-yellow-700',
  low:      'bg-slate-100 text-slate-600',
};

const STATUS_STYLES = {
  passing: 'bg-green-100 text-green-700',
  failing: 'bg-red-100 text-red-700',
  pending: 'bg-yellow-100 text-yellow-700',
};

function Badge({ label, styleMap }) {
  const cls = styleMap[label.toLowerCase()] ?? 'bg-slate-100 text-slate-600';
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${cls}`}>
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Score Card
// ---------------------------------------------------------------------------
function ScoreCard({ label, score, trend, passing, failing, pending, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="bg-white shadow-lg rounded-lg p-5 text-left w-full hover:shadow-xl transition-shadow focus:outline-none focus:ring-2 focus:ring-blue-500"
      aria-label={`${label} compliance score: ${score}%. ${trend}. Passing: ${passing}, Failing: ${failing}, Pending: ${pending}.`}
    >
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{label}</p>
      <p className="text-4xl font-black text-slate-900 mb-1">{score}%</p>
      {trend && (
        <p className="text-xs font-medium text-green-600 mb-3">{trend}</p>
      )}
      <div className="flex flex-wrap gap-2 text-xs font-medium">
        <span className="text-green-600">✓ {passing} passing</span>
        <span className="text-red-600">✗ {failing} failing</span>
        <span className="text-yellow-600">◷ {pending} pending</span>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Trend Chart
// ---------------------------------------------------------------------------
const CHART_LINE_STYLES = [
  { borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,0.08)' },
  { borderColor: '#16a34a', backgroundColor: 'rgba(22,163,74,0.08)' },
  { borderColor: '#dc2626', backgroundColor: 'rgba(220,38,38,0.08)' },
  { borderColor: '#d97706', backgroundColor: 'rgba(217,119,6,0.08)' },
];

const CHART_OPTIONS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: 'top' },
    title: { display: false },
    tooltip: {
      callbacks: {
        label: (ctx) => ` ${ctx.dataset.label}: ${ctx.parsed.y}%`,
      },
    },
  },
  scales: {
    y: {
      min: 0,
      max: 100,
      ticks: { callback: (v) => `${v}%` },
      grid: { color: 'rgba(0,0,0,0.05)' },
    },
    x: {
      grid: { display: false },
      ticks: {
        maxTicksLimit: 10,
        maxRotation: 0,
      },
    },
  },
};

function TrendChart() {
  const { labels, datasets } = complianceScoreHistory;
  const chartData = {
    labels,
    datasets: [
      { label: 'Overall',  data: datasets.overall,  tension: 0.3, pointRadius: 2, fill: true, ...CHART_LINE_STYLES[0] },
      { label: 'SOC 2',   data: datasets.soc2,     tension: 0.3, pointRadius: 2, fill: false, ...CHART_LINE_STYLES[1] },
      { label: 'HIPAA',   data: datasets.hipaa,    tension: 0.3, pointRadius: 2, fill: false, ...CHART_LINE_STYLES[2] },
      { label: 'FedRAMP', data: datasets.fedramp,  tension: 0.3, pointRadius: 2, fill: false, ...CHART_LINE_STYLES[3] },
    ],
  };

  return (
    <div className="bg-white shadow-lg rounded-lg p-6">
      <h2 className="text-base font-bold text-slate-800 mb-4">90-Day Compliance Trend</h2>
      <div className="h-64 md:h-96">
        <Line data={chartData} options={CHART_OPTIONS} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Controls Table
// ---------------------------------------------------------------------------
const FILTER_OPTIONS = ['All', 'Passing', 'Failing', 'Pending'];

function ControlRow({ control }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr
        className="hover:bg-slate-50 cursor-pointer transition-colors"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-label={`Control ${control.id}: ${control.title}`}
      >
        <td className="px-4 py-3 text-xs font-mono text-slate-600 whitespace-nowrap">{control.id}</td>
        <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{control.framework}</td>
        <td className="px-4 py-3 text-sm text-slate-800 max-w-xs truncate">{control.title}</td>
        <td className="px-4 py-3">
          <Badge label={control.status} styleMap={STATUS_STYLES} />
        </td>
        <td className="px-4 py-3">
          <Badge label={control.severity} styleMap={SEVERITY_STYLES} />
        </td>
        <td className="px-4 py-3 text-slate-400 text-xs">{expanded ? '▲' : '▼'}</td>
      </tr>
      {expanded && (
        <tr className="bg-blue-50">
          <td colSpan={6} className="px-6 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="font-semibold text-slate-700 mb-1">Evidence</p>
                <p className="text-slate-600">{control.evidence}</p>
              </div>
              <div>
                <p className="font-semibold text-slate-700 mb-1">Remediation Steps</p>
                <p className="text-slate-600">{control.remediation}</p>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function ControlsTable() {
  const [filter, setFilter] = useState('All');

  const filtered = filter === 'All'
    ? mockControls
    : mockControls.filter((c) => c.status === filter.toLowerCase());

  return (
    <div className="bg-white shadow-lg rounded-lg p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-base font-bold text-slate-800">Compliance Controls</h2>
        <div className="flex gap-2" role="group" aria-label="Filter controls by status">
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setFilter(opt)}
              aria-pressed={filter === opt}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                filter === opt
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Control ID</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Framework</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Title</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Severity</th>
              <th className="px-4 py-2 w-6" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-400">
                  No controls match this filter.
                </td>
              </tr>
            ) : (
              filtered.map((c) => <ControlRow key={c.id} control={c} />)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quick Actions & Scan Info sidebar
// ---------------------------------------------------------------------------
function formatRelativeTime(isoString) {
  const diff = Date.now() - new Date(isoString).getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) return `${hours}h ${mins}m ago`;
  return `${mins}m ago`;
}

function formatCountdown(isoString) {
  const diff = new Date(isoString).getTime() - Date.now();
  if (diff <= 0) return 'Imminent';
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${mins}m`;
}

function QuickActions({ scanInfo, onAction, onScanComplete }) {
  const [actionStatus, setActionStatus] = useState(null);

  const handleAction = async (label, apiFn) => {
    const isFullScan = label === 'Run Full Scan';
    if (isFullScan) {
      ComplianceEvents.policyScanInitiated('full_scan', 'full');
    }
    const scanStartTime = Date.now();
    setActionStatus({ label, loading: true });
    try {
      const result = await apiFn();
      setActionStatus({ label, loading: false, message: result.message });
      onAction && onAction(label, result);
      if (isFullScan && onScanComplete) {
        ComplianceEvents.policyScanCompleted('full_scan', {
          total: result.findings?.length ?? 0,
          critical: result.criticalCount ?? 0,
          high: result.highCount ?? 0,
          medium: result.mediumCount ?? 0,
          low: result.lowCount ?? 0,
          duration: Date.now() - scanStartTime,
          score: result.complianceScore ?? 0,
        });
        onScanComplete();
      }
    } catch (err) {
      setActionStatus({ label, loading: false, message: 'Action failed. Please retry.' });
      if (isFullScan) {
        ComplianceEvents.policyScanFailed(
          'full_scan',
          err?.name ?? 'Error',
          err?.message ?? '',
        );
      }
    }
    setTimeout(() => setActionStatus(null), 3000);
  };

  return (
    <div className="bg-white shadow-lg rounded-lg p-6 flex flex-col gap-4">
      <h2 className="text-base font-bold text-slate-800">Quick Actions</h2>

      <button
        type="button"
        disabled={actionStatus?.loading}
        onClick={() => handleAction('Run Full Scan', mockAPI.runFullScan)}
        className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors"
      >
        {actionStatus?.label === 'Run Full Scan' && actionStatus.loading ? 'Starting…' : '▶ Run Full Scan'}
      </button>

      <button
        type="button"
        disabled={actionStatus?.loading}
        onClick={() => handleAction('Generate PDF Report', mockAPI.generatePDFReport)}
        className="w-full py-2.5 px-4 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors"
      >
        {actionStatus?.label === 'Generate PDF Report' && actionStatus.loading ? 'Generating…' : '📄 Generate PDF Report'}
      </button>

      <button
        type="button"
        disabled={actionStatus?.loading}
        onClick={() => handleAction('Export CSV', mockAPI.exportCSV)}
        className="w-full py-2.5 px-4 bg-slate-200 hover:bg-slate-300 disabled:opacity-60 text-slate-700 text-sm font-semibold rounded-lg transition-colors"
      >
        {actionStatus?.label === 'Export CSV' && actionStatus.loading ? 'Exporting…' : '⬇ Export CSV'}
      </button>

      <button
        type="button"
        onClick={() => handleDownloadEvidenceExport('cnb-waxahachie', 'FFIEC')}
        className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 shadow-sm"
      >
        🛡️ Export Signed Audit Package
      </button>

      {actionStatus && !actionStatus.loading && (
        <p className="text-xs text-center text-green-700 bg-green-50 rounded px-3 py-2">
          {actionStatus.message}
        </p>
      )}

      {scanInfo && (
        <>
          <hr className="border-slate-100" />
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Last Scan</span>
              <span className="font-medium text-slate-700">{formatRelativeTime(scanInfo.timestamp)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Duration</span>
              <span className="font-medium text-slate-700">{scanInfo.duration}</span>
            </div>
          </div>
          <hr className="border-slate-100" />
          <div className="text-sm">
            <p className="text-slate-500 mb-1">Next Scheduled Scan</p>
            <p className="font-semibold text-blue-600">{formatCountdown(scanInfo.nextScan)}</p>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main ComplianceDashboard component
// ---------------------------------------------------------------------------
export default function ComplianceDashboard() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const {
    phase,
    score,
    findings,
    showCTA,
    ctaVariant,
    showComparison,
    finalScore,
    runPostScanFlow,
    dismissFindings,
    dismissCTA,
    dismissComparison,
    trackCTAClick,
  } = usePostScanFlow({ initialScore: 73, finalScore: 94 });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await mockAPI.getComplianceSummary();
        if (!cancelled) setSummary(data);
      } catch (err) {
        if (!cancelled) setError(err.message ?? 'Failed to load compliance data.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleCardClick = () => {
    // TODO: Navigate to framework-specific drill-down view (Phase 3b).
  };

  const handleAction = () => {
    // Actions are handled by QuickActions; post-scan flow is triggered via onScanComplete.
  };

  // Derived: use animated score when post-scan flow is active
  const displayScore = phase !== 'idle' ? score : (summary?.overall?.score ?? null);

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-slate-50 p-4 md:p-8">

        {/* Phase 1: scan-complete checkmark */}
        <ScanCompleteCheck visible={phase === 'complete'} scanTimeSeconds={3.6} />

        {/* Phase 3: findings toast */}
        <FindingsToast findings={findings} onDismiss={dismissFindings} />

        {/* Phase 5: industry comparison */}
        {showComparison && (
          <ComparisonBanner yourScore={finalScore} onDismiss={dismissComparison} />
        )}

        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900">Compliance Dashboard</h1>
            <p className="text-sm text-slate-500 mt-1">Real-time overview across FFIEC, SOC 2, HIPAA, and FedRAMP frameworks</p>
          </div>
          <ComplianceExportButton tenantId="cnb-waxahachie" framework="FFIEC" />
        </header>

        {error && (
          <div role="alert" className="mb-6 rounded-lg bg-red-50 border border-red-200 px-5 py-4 text-red-700 text-sm font-medium">
            {error}
          </div>
        )}

        {/* Score Cards */}
        <section aria-label="Compliance score summary" className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
          {loading ? (
            [...Array(4)].map((_, i) => <ScoreCardSkeleton key={i} />)
          ) : summary ? (
            <>
              <ScoreCard
                label="Overall"
                score={displayScore ?? summary.overall.score}
                trend={summary.overall.trend}
                passing={summary.overall.passing}
                failing={summary.overall.failing}
                pending={summary.overall.pending}
                onClick={() => handleCardClick('Overall')}
              />
              <ScoreCard
                label="SOC 2"
                score={summary.soc2.score}
                trend={summary.soc2.trend}
                passing={summary.soc2.passing}
                failing={summary.soc2.failing}
                pending={summary.soc2.pending}
                onClick={() => handleCardClick('SOC 2')}
              />
              <ScoreCard
                label="HIPAA"
                score={summary.hipaa.score}
                trend={summary.hipaa.trend}
                passing={summary.hipaa.passing}
                failing={summary.hipaa.failing}
                pending={summary.hipaa.pending}
                onClick={() => handleCardClick('HIPAA')}
              />
              <ScoreCard
                label="FedRAMP"
                score={summary.fedramp.score}
                trend={summary.fedramp.trend}
                passing={summary.fedramp.passing}
                failing={summary.fedramp.failing}
                pending={summary.fedramp.pending}
                onClick={() => handleCardClick('FedRAMP')}
              />
            </>
          ) : null}
        </section>

        {/* Phase 4: CTA banner (rendered below score cards) */}
        {showCTA && (
          <CTABanner
            ctaVariant={ctaVariant}
            onDismiss={dismissCTA}
            onButtonClick={trackCTAClick}
            onGeneratePDF={mockAPI.generatePDFReport}
          />
        )}

        {/* Trend Chart */}
        <section aria-label="90-day compliance trend" className="mb-6 mt-6">
          {loading ? <ChartSkeleton /> : <TrendChart />}
        </section>

        {/* Controls Table + Quick Actions */}
        <section
          aria-label="Controls and quick actions"
          className="grid grid-cols-1 lg:grid-cols-3 gap-6"
        >
          <div className="lg:col-span-2">
            {loading ? <TableSkeleton /> : <ControlsTable />}
          </div>
          <div className="lg:col-span-1">
            {loading ? (
              <SidebarSkeleton />
            ) : (
              <QuickActions
                scanInfo={summary ? { ...summary.lastScan, nextScan: summary.nextScan } : null}
                onAction={handleAction}
                onScanComplete={runPostScanFlow}
              />
            )}
          </div>
        </section>
      </div>
    </ErrorBoundary>
  );
}