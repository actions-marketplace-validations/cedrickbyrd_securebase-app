const fs = require('fs');
const path = require('path');

function processPlan() {
  const planPath = process.argv[2] || 'tfplan.json';
  if (!fs.existsSync(planPath)) {
    console.error(`Plan file not found: ${planPath}`);
    process.exit(1);
  }

  const rawPlan = fs.readFileSync(planPath, 'utf8');
  let planData;
  try {
    planData = JSON.parse(rawPlan);
  } catch (err) {
    console.error("Failed to parse tfplan.json:", err.message);
    process.exit(1);
  }

  const resourceChanges = planData.resource_changes || [];
  const findings = [];
  let criticalCount = 0;
  let highCount = 0;
  let mediumCount = 0;

  resourceChanges.forEach((change) => {
    const type = change.type;
    const address = change.address;
    const values = change.change.after || {};

    if (type === 'aws_s3_bucket') {
      if (!values.object_lock_enabled) {
        findings.push({
          severity: 'CRITICAL',
          resource: address,
          rule: 'S3 Object Lock Disabled (WORM Invalidation)',
          citation: 'FFIEC CAT Appendix A / HIPAA § 164.312(c)(1)',
          remediation: 'Enable object_lock_enabled = true to preserve immutable audit trails.'
        });
        criticalCount++;
      }
    }

    if (type === 'aws_s3_bucket_server_side_encryption_configuration') {
      const rules = values.rule || [];
      const hasKms = rules.some(r => 
        r.apply_server_side_encryption_by_default && 
        r.apply_server_side_encryption_by_default.sse_algorithm === 'aws:kms'
      );
      if (!hasKms) {
        findings.push({
          severity: 'HIGH',
          resource: address,
          rule: 'Missing Customer-Managed KMS Key Encryption',
          citation: 'FFIEC IT Examination Handbook: InfoSec / SOC 2 CC6.1',
          remediation: 'Configure sse_algorithm = "aws:kms" with dedicated KMS Key ARN.'
        });
        highCount++;
      }
    }

    if (type === 'aws_security_group') {
      const ingressRules = values.ingress || [];
      ingressRules.forEach((rule) => {
        const cidrs = rule.cidr_blocks || [];
        if (cidrs.includes('0.0.0.0/0') && (rule.from_port === 22 || rule.from_port === 3389)) {
          findings.push({
            severity: 'CRITICAL',
            resource: address,
            rule: `Unrestricted Administrative Port (${rule.from_port}) Ingress`,
            citation: 'NIST SP 800-53 AC-17 / FFIEC CAT Domain 3',
            remediation: 'Restrict cidr_blocks to enterprise bastion IP ranges.'
          });
          criticalCount++;
        }
      });
    }
  });

  const totalFindings = findings.length;
  const initialScore = totalFindings === 0 ? 100 : Math.max(45, 100 - (criticalCount * 20 + highCount * 10 + mediumCount * 5));
  
  const tenantId = process.env.SECUREBASE_TENANT_ID || 'demo-enterprise-sandbox';
  const demoHost = process.env.SECUREBASE_DEMO_HOST || 'demo.securebase.tximhotep.com';
  const interactiveSandboxUrl = `https://${demoHost}/compliance?tenant=${tenantId}&utm_source=github_actions&utm_medium=pr_comment&utm_campaign=securebase_mcp_shift_left`;

  let markdown = `## SecureBase Multi-Cloud Compliance Report\n\n`;
  markdown += `**Compliance Score:** \`\${initialScore}%\` ${initialScore >= 90 ? '🟢' : initialScore >= 70 ? '🟡' : '🔴'}\n`;
  markdown += `**Evaluated Frameworks:** FFIEC CAT | HIPAA Security Rule | SOC 2 Type II\n\n`;

  if (totalFindings === 0) {
    markdown += `✅ **No compliance drift or regulatory violations detected.** Infrastructure change is ready for merge.\n\n`;
  } else {
    markdown += `⚠️ **${totalFindings} Non-Compliant Configuration(s) Detected:**\n\n`;
    markdown += `| Severity | Finding / Policy | Resource | Framework Citation |\n`;
    markdown += `| :--- | :--- | :--- | :--- |\n`;
    findings.forEach((f) => {
      const severityIcon = f.severity === 'CRITICAL' ? '🚨 CRITICAL' : f.severity === 'HIGH' ? '🔶 HIGH' : '🔹 MEDIUM';
      markdown += `| ${severityIcon} | **${f.rule}**<br>_${f.remediation}_ | \`\${f.resource}\` | \`\${f.citation}\` |\n`;
    });
    markdown += `\n`;
  }

  markdown += `### 🛠️ Interactive Remediation & Audit Vault\n`;
  markdown += `Simulate live OPA fixes and download signed WORM audit evidence packages for this PR:\n`;
  markdown += `👉 **[Launch SecureBase Interactive Sandbox](${interactiveSandboxUrl})**\n\n`;
  markdown += `_\`securebase-mcp\` automated guardrail engine executed by TxImhotep LLC._`;

  const reportOutput = {
    evaluated_at: new Date().toISOString(),
    score: initialScore,
    total_violations: totalFindings,
    critical_violations: criticalCount,
    high_violations: highCount,
    findings: findings,
    demo_sandbox_url: interactiveSandboxUrl,
    markdown_summary: markdown
  };

  console.log(JSON.stringify(reportOutput, null, 2));
}

processPlan();
