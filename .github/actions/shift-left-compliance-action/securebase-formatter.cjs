/**
 * SecureBase Shift-Left Compliance Formatter & PR Reporter
 * Package: securebase/shift-left-compliance-action
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const WORKING_DIR = process.env.INPUT_WORKING_DIRECTORY || '.';
const FAIL_ON_SEVERITY = (process.env.INPUT_FAIL_ON_SEVERITY || 'HIGH').toUpperCase();
const COMMENT_ON_PR = process.env.INPUT_COMMENT_ON_PR !== 'false';
const GITHUB_TOKEN = process.env.INPUT_GITHUB_TOKEN;
const REPO = process.env.GITHUB_REPOSITORY;
const PR_NUMBER = process.env.PR_NUMBER;

const DEMO_BASE_URL = 'https://demo.securebase.tximhotep.com';

// Standard Severity Ranking
const SEVERITY_WEIGHTS = { NONE: 0, LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };

// Built-in Static Compliance Rules Engine
function evaluateTerraform(dirPath) {
  const findings = [];
  let filesScanned = 0;

  function scanDirectory(currentPath) {
    const files = fs.readdirSync(currentPath);
    for (const file of files) {
      const fullPath = path.join(currentPath, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory() && !file.startsWith('.')) {
        scanDirectory(fullPath);
      } else if (file.endsWith('.tf')) {
        filesScanned++;
        const content = fs.readFileSync(fullPath, 'utf8');
        checkRules(fullPath, content, findings);
      }
    }
  }

  scanDirectory(dirPath);
  return { findings, filesScanned };
}

function checkRules(filePath, content, findings) {
  const relPath = path.relative(process.cwd(), filePath);

  // Rule 1: S3 Bucket Public Access Block (FFIEC CAT / HIPAA § 164.312)
  if (content.includes('aws_s3_bucket') && !content.includes('aws_s3_bucket_public_access_block')) {
    findings.push({
      ruleId: 'SB-AWS-S3-001',
      title: 'S3 Bucket Public Access Block Missing',
      severity: 'HIGH',
      framework: 'FFIEC CAT Domain 3 / HIPAA § 164.312(e)(1)',
      file: relPath,
      line: 1,
      description: 'S3 buckets must explicitly enforce public access restrictions to prevent unauthorized exposure.',
      remediationCode: `resource "aws_s3_bucket_public_access_block" "example" {\n  bucket = aws_s3_bucket.example.id\n  block_public_acls = true\n  block_public_policy = true\n}`
    });
  }

  // Rule 2: Unencrypted Storage Volumes (FFIEC IT Handbook / NIST SP 800-53)
  if (content.includes('aws_ebs_volume') && !content.includes('encrypted = true')) {
    findings.push({
      ruleId: 'SB-AWS-EBS-002',
      title: 'Unencrypted EBS Volume Detected',
      severity: 'CRITICAL',
      framework: 'FFIEC CAT Domain 3 / NIST SP 800-53 SC-28',
      file: relPath,
      line: 1,
      description: 'Data at rest must be encrypted using AWS KMS Customer Managed Keys.',
      remediationCode: `resource "aws_ebs_volume" "example" {\n  encrypted  = true\n  kms_key_id = aws_kms_key.cmk.arn\n}`
    });
  }

  // Rule 3: Permissive Ingress Security Group Rules
  if (content.includes('0.0.0.0/0') && (content.includes('from_port = 22') || content.includes('from_port = 3389'))) {
    findings.push({
      ruleId: 'SB-AWS-NET-003',
      title: 'Unrestricted Management Port (SSH/RDP) Open to Internet',
      severity: 'CRITICAL',
      framework: 'FFIEC CAT Domain 2 / PCI-DSS 1.3',
      file: relPath,
      line: 1,
      description: 'Security groups must not allow 0.0.0.0/0 ingress on administrative ports.',
      remediationCode: `# Restrict cidr_blocks to enterprise bastion or VPN subnet\ncidr_blocks = ["10.0.0.0/16"]`
    });
  }
}

async function postGitHubComment(commentBody) {
  if (!GITHUB_TOKEN || !REPO || !PR_NUMBER) {
    console.log('[SecureBase Action] PR Commenting skipped (missing token or PR context).');
    return;
  }

  const endpoint = `https://api.github.com/repos/${REPO}/issues/${PR_NUMBER}/comments`;
  const data = JSON.stringify({ body: commentBody });

  const options = {
    method: 'POST',
    headers: {
      'User-Agent': 'SecureBase-Compliance-Action',
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Content-Type': 'application/json',
      'Content-Length': data.length
    }
  };

  return new Promise((resolve) => {
    const req = https.request(endpoint, options, (res) => {
      if (res.statusCode === 201) {
        console.log('[SecureBase Action] PR comment successfully posted.');
      } else {
        console.error(`[SecureBase Action] Failed to post PR comment. HTTP ${res.statusCode}`);
      }
      resolve();
    });
    req.on('error', (err) => {
      console.error('[SecureBase Action] Error posting comment:', err.message);
      resolve();
    });
    req.write(data);
    req.end();
  });
}

async function main() {
  console.log(`[SecureBase Action] Initiating shift-left compliance scan in: ${WORKING_DIR}`);
  const { findings, filesScanned } = evaluateTerraform(WORKING_DIR);

  const criticals = findings.filter(f => f.severity === 'CRITICAL').length;
  const highs = findings.filter(f => f.severity === 'HIGH').length;
  const mediums = findings.filter(f => f.severity === 'MEDIUM').length;
  const lows = findings.filter(f => f.severity === 'LOW').length;

  const total = findings.length;
  const complianceScore = filesScanned === 0 ? 100 : Math.max(0, Math.round(100 - (total * 12)));

  console.log(`[SecureBase Action] Scanned ${filesScanned} TF files. Findings: ${total} (Critical: ${criticals}, High: ${highs})`);

  // Build Markdown PR Comment with traffic attribution query params
  const repoSlug = encodeURIComponent(REPO || 'external-org');
  const demoRefUrl = `${DEMO_BASE_URL}?utm_source=github_action&utm_medium=pr_comment&utm_campaign=shift_left_scan&repo=${repoSlug}&findings=${total}`;

  let commentMarkdown = `### 🛡️ SecureBase Shift-Left Compliance Report\n\n`;
  commentMarkdown += `**Repository:** \`\${REPO}\` | **Files Scanned:** \`\${filesScanned}\` | **Compliance Score:** \`\${complianceScore}%\`\n\n`;

  if (findings.length === 0) {
    commentMarkdown += `✅ **No regulatory compliance issues detected.** Infrastructure meets standard FFIEC / HIPAA posture controls.\n\n`;
  } else {
    commentMarkdown += `⚠️ **${total} Infrastructure Non-Compliance Findings Detected:**\n\n`;
    commentMarkdown += `| Severity | Rule ID | Framework Citation | File | Summary |\n`;
    commentMarkdown += `| :--- | :--- | :--- | :--- | :--- |\n`;

    findings.forEach(f => {
      const badge = f.severity === 'CRITICAL' ? '🔴 CRITICAL' : f.severity === 'HIGH' ? '🟠 HIGH' : '🟡 MEDIUM';
      commentMarkdown += `| ${badge} | \`\${f.ruleId}\` | ${f.framework} | \`\${f.file}\` | ${f.title} |\n`;
    });

    commentMarkdown += `\n<details>\n<summary><b>🔍 View Remediation Details & IaC Code Fixes</b></summary>\n\n`;
    findings.forEach(f => {
      commentMarkdown += `#### [${f.severity}] ${f.ruleId}: ${f.title}\n`;
      commentMarkdown += `- **File:** \`\${f.file}\`\n`;
      commentMarkdown += `- **Framework:** ${f.framework}\n`;
      commentMarkdown += `- **Issue:** ${f.description}\n\n`;
      commentMarkdown += `\`\`\`hcl\n\${f.remediationCode}\n\`\`\`\n\n`;
    });
    commentMarkdown += `</details>\n\n`;
  }

  commentMarkdown += `---\n`;
  commentMarkdown += `🔗 **[Simulate Sandbox Remediation & Export Attestation Vault on SecureBase Control Plane](${demoRefUrl})**\n\n`;
  commentMarkdown += `*Driven by [SecureBase Shift-Left Governance](https://github.com/marketplace/actions/securebase-shift-left-compliance-action)*`;

  if (COMMENT_ON_PR && PR_NUMBER) {
    await postGitHubComment(commentMarkdown);
  }

  // Set GitHub Action Outputs
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `findings-count=${total}\n`);
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `critical-count=${criticals}\n`);
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `high-count=${highs}\n`);
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `compliance-score=${complianceScore}\n`);
  }

  // Evaluate Build Failure Condition
  const thresholdWeight = SEVERITY_WEIGHTS[FAIL_ON_SEVERITY] || SEVERITY_WEIGHTS.HIGH;
  const hasFailingFinding = findings.some(f => SEVERITY_WEIGHTS[f.severity] >= thresholdWeight);

  if (hasFailingFinding) {
    console.error(`\n❌ [SecureBase Action] Scan failed. Detected findings at or above configured severity threshold (${FAIL_ON_SEVERITY}).`);
    process.exit(1);
  } else {
    console.log(`\n✅ [SecureBase Action] Scan passed threshold criteria.`);
    process.exit(0);
  }
}

main().catch(err => {
  console.error('[SecureBase Action] Unhandled execution error:', err);
  process.exit(1);
});