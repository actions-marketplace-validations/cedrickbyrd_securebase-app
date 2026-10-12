import React from 'react';

export const handleDownloadEvidenceExport = (tenantId: string, framework: string) => {
  if (!tenantId) return;
  const targetFramework = framework || 'FFIEC';
  const exportUrl = `https://securebase-api.onrender.com/api/v1/compliance/export?tenant_id=${encodeURIComponent(tenantId)}&framework=${encodeURIComponent(targetFramework)}`;
  
  const link = document.createElement('a');
  link.href = exportUrl;
  link.setAttribute('download', `${tenantId}_${targetFramework}_evidence_export.json`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const ComplianceExportButton: React.FC<{
  tenantId?: string;
  framework?: string;
  className?: string;
}> = ({ tenantId = 'cnb-waxahachie', framework = 'FFIEC', className = '' }) => {
  return (
    <button
      type="button"
      onClick={() => handleDownloadEvidenceExport(tenantId, framework)}
      className={`py-2 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 shadow-sm ${className}`}
      title="Download SHA-256 Cryptographic Evidence Package"
    >
      <span>🛡️</span> Export Audit Package
    </button>
  );
};

export default ComplianceExportButton;