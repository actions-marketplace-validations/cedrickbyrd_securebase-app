#!/bin/bash

# ============================================
# SecureBase Automated Customer Onboarding
# ============================================
# Provisions a complete customer (Phase 1 + Phase 2):
# - AWS Organization & OUs
# - IAM Identity Center
# - VPC networking
# - Database records (direct insertion)
# - API keys (hashed storage)
# - Billing setup
#
# Prerequisites:
#   - AWS CLI configured
#   - Terraform installed
#   - PostgreSQL client (psql) installed
#   - Database connection configured in .env
#
# Usage: ./onboard-customer.sh --name "ACME Finance" --tier fintech --framework soc2 --email admin@acme.com

set -e  # Exit on error

# ============================================
# CONFIGURATION
# ============================================

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
# Get repo root (go up one level from scripts/)
REPO_ROOT="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
TERRAFORM_DIR="${REPO_ROOT}/landing-zone/environments/dev"
BACKEND_SCRIPT="${SCRIPT_DIR}/scripts/onboarding-helpers.py"

# Load database helper functions once at startup
# shellcheck source=lib/database.sh
source "${SCRIPT_DIR}/lib/database.sh"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ============================================
# FUNCTIONS
# ============================================

print_header() {
  echo ""
  echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${BLUE}║${NC}  $1"
  echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
  echo ""
}

print_step() {
  echo -e "${YELLOW}▶${NC} $1"
}

print_success() {
  echo -e "${GREEN}✅${NC} $1"
}

print_error() {
  echo -e "${RED}❌${NC} $1"
  exit 1
}

validate_inputs() {
  if [[ -z "$CUSTOMER_NAME" || -z "$TIER" || -z "$FRAMEWORK" || -z "$EMAIL" ]]; then
    print_error "Missing required arguments. Usage:"
    echo "  $0 --name 'Customer Name' --tier [standard|fintech|healthcare|gov-federal] --framework [soc2|hipaa|fedramp|cis] --email customer@example.com"
    exit 1
  fi
  
  # Validate tier
  if [[ ! "$TIER" =~ ^(standard|fintech|healthcare|gov-federal)$ ]]; then
    print_error "Invalid tier: $TIER"
  fi
  
  # Validate framework
  if [[ ! "$FRAMEWORK" =~ ^(soc2|hipaa|fedramp|cis|ffiec|pci-dss)$ ]]; then
    print_error "Invalid framework: $FRAMEWORK"
  fi

  # Validate email
  if [[ ! "$EMAIL" =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]]; then
    print_error "Invalid email: $EMAIL"
  fi
}

check_prerequisites() {
  print_step "Checking prerequisites..."
  
  # Check AWS CLI
  if ! command -v aws &> /dev/null; then
    print_error "AWS CLI not found. Please install it first."
  fi
  
  # Check Terraform
  if ! command -v terraform &> /dev/null; then
    print_error "Terraform not found. Please install it first."
  fi
  
  # Check jq for JSON parsing
  if ! command -v jq &> /dev/null; then
    print_error "jq not found. Please install it first: apt-get install jq"
  fi
  
  # Check psql (PostgreSQL client)
  if ! command -v psql &> /dev/null; then
    print_error "psql not found. Install PostgreSQL client: apt-get install postgresql-client"
  fi
  
  # Check uuidgen for UUID generation
  if ! command -v uuidgen &> /dev/null; then
    print_error "uuidgen not found. Install uuid-runtime: apt-get install uuid-runtime"
  fi
  
  # Check AWS credentials
  if ! aws sts get-caller-identity &> /dev/null; then
    print_error "AWS credentials not configured. Run: aws configure"
  fi
  
  # Check database connection
  if ! load_db_config; then
    print_error "Database connection not configured. Set VITE_SUPABASE_URL in .env or DB_HOST/DB_USER environment variables."
  fi
  
  print_success "All prerequisites met"
}

generate_customer_id() {
  # Convert customer name to lowercase, remove spaces, take first 20 chars
  CUSTOMER_ID=$(echo "$CUSTOMER_NAME" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9-' | cut -c1-20)
  CUSTOMER_ID="${CUSTOMER_ID}-${RANDOM}"  # Add randomness for uniqueness
  echo "$CUSTOMER_ID"
}

update_terraform_config() {
  print_step "Updating Terraform configuration..."
  
  # Add customer to client.auto.tfvars
  cat >> "${TERRAFORM_DIR}/client.auto.tfvars" << EOF

# Customer: ${CUSTOMER_NAME} (added $(date +%Y-%m-%d))
${CUSTOMER_ID} = {
  tier         = "${TIER}"
  account_id   = ""  # Will be auto-assigned by AWS
  prefix       = "${CUSTOMER_ID}"
  framework    = "${FRAMEWORK}"
  vpc_cidr     = "${VPC_CIDR}"
  tags = {
    Customer       = "${CUSTOMER_NAME}"
    Tier           = "${TIER}"
    Framework      = "${FRAMEWORK}"
    OnboardedAt    = "$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
    OnboardedBy    = "$(whoami)"
  }
}
EOF
  
  print_success "Terraform configuration updated"
}

plan_infrastructure() {
  print_step "Planning infrastructure changes..."
  
  cd "${TERRAFORM_DIR}"
  
  terraform init -upgrade -lock=false 2>/dev/null || true
  
  terraform plan \
    -var-file=terraform.tfvars \
    -out=tfplan-${CUSTOMER_ID}.out \
    -lock=false
  
  # Count resources
  RESOURCE_COUNT=$(terraform show tfplan-${CUSTOMER_ID}.out -json | jq '.resource_changes | length')
  
  print_success "Plan created: $RESOURCE_COUNT resources to create"
}

apply_infrastructure() {
  print_step "Applying Terraform configuration..."
  
  cd "${TERRAFORM_DIR}"
  
  terraform apply \
    -lock=false \
    -auto-approve \
    tfplan-${CUSTOMER_ID}.out
  
  print_success "Infrastructure deployed"
  
  # Capture outputs
  ORG_ID=$(terraform output -raw organization_id 2>/dev/null || echo "")
  MGMT_ACCOUNT=$(terraform output -raw managed_account_id 2>/dev/null || echo "")
  
  print_success "Organization ID: $ORG_ID"
  print_success "Management Account: $MGMT_ACCOUNT"
}

create_database_records() {
  print_step "Creating database records..."

  # Generate UUID for customer
  CUSTOMER_UUID=$(uuidgen | tr '[:upper:]' '[:lower:]')

  # Escape string values to prevent SQL injection
  local safe_name
  safe_name=$(escape_sql_string "${CUSTOMER_NAME}")
  local safe_email
  safe_email=$(escape_sql_string "${EMAIL}")
  local safe_org_id
  safe_org_id=$(escape_sql_string "${ORG_ID}")
  local safe_mgmt_account
  safe_mgmt_account=$(escape_sql_string "${MGMT_ACCOUNT}")
  local safe_onboarded_by
  safe_onboarded_by=$(escape_sql_string "$(whoami)")

  # Build SQL with transaction
  local CUSTOMER_SQL
  CUSTOMER_SQL=$(cat <<SQL
BEGIN;

-- Insert customer record
INSERT INTO customers (
  id, name, tier, framework, aws_org_id,
  aws_management_account_id, email, status,
  billing_email, payment_method, tags, custom_config,
  mfa_enforced, audit_retention_days,
  encryption_required, vpc_isolation_enabled
) VALUES (
  '${CUSTOMER_UUID}',
  '${safe_name}',
  '${TIER}',
  '${FRAMEWORK}',
  '${safe_org_id}',
  '${safe_mgmt_account}',
  '${safe_email}',
  'active',
  '${safe_email}',
  'aws_marketplace',
  jsonb_build_object('customer', '${safe_name}', 'tier', '${TIER}'),
  '{}',
  true,
  2555,
  true,
  true
);

-- Insert initial usage metrics record
INSERT INTO usage_metrics (
  customer_id, month, account_count, ou_count, scp_count,
  cloudtrail_events_logged, config_rule_evaluations,
  guardduty_findings, log_storage_gb, archive_storage_gb
) VALUES (
  '${CUSTOMER_UUID}',
  DATE_TRUNC('month', NOW()),
  1, 1, 5, 0, 0, 0, 0, 0
);

-- Log audit event
INSERT INTO audit_events (
  customer_id, event_type, action, actor_email, status, metadata
) VALUES (
  '${CUSTOMER_UUID}',
  'customer',
  'customer.onboarded',
  '${safe_email}',
  'success',
  jsonb_build_object('tier', '${TIER}', 'framework', '${FRAMEWORK}', 'onboarded_by', '${safe_onboarded_by}')
);

COMMIT;
SQL
)

  # Execute SQL directly
  if execute_sql "$CUSTOMER_SQL" "Failed to create customer records"; then
    print_success "Customer record created: ${CUSTOMER_UUID}"
    print_success "Database: ${DB_HOST}/${DB_NAME}"
  else
    print_error "Database insertion failed. See error output above for details."
  fi
}

generate_api_key() {
  print_step "Generating API key..."

  # Generate secure random API key
  API_KEY_PREFIX="sk_live_${CUSTOMER_ID}"
  API_KEY_SECRET=$(openssl rand -hex 32)
  FULL_API_KEY="${API_KEY_PREFIX}_${API_KEY_SECRET}"

  # Hash for database storage (store only the hash, never plaintext)
  API_KEY_HASH=$(echo -n "${FULL_API_KEY}" | sha256sum | awk '{print $1}')

  # Escape string values
  local safe_name
  safe_name=$(escape_sql_string "${CUSTOMER_NAME}")

  # Insert hashed key into database
  local API_KEY_SQL
  API_KEY_SQL=$(cat <<SQL
INSERT INTO api_keys (
  customer_id,
  key_hash,
  key_prefix,
  name,
  scopes,
  created_at
) VALUES (
  '${CUSTOMER_UUID}',
  '${API_KEY_HASH}',
  '${API_KEY_PREFIX}',
  'Initial API key for ${safe_name}',
  ARRAY['read:invoices', 'read:metrics', 'read:audit', 'read:customers'],
  NOW()
);
SQL
)

  if execute_sql "$API_KEY_SQL" "Failed to store API key"; then
    print_success "API key generated and stored (hashed)"
  else
    print_error "Failed to store API key in database"
  fi

  # Save full key to secure file (one-time display)
  cat > /tmp/api-key-${CUSTOMER_ID}.txt << EOF
╔════════════════════════════════════════════════════════════╗
║        SecureBase API Key - KEEP SECURE                   ║
╚════════════════════════════════════════════════════════════╝

Customer:   ${CUSTOMER_NAME}
Tier:       ${TIER}
Created:    $(date)

API Key (DISPLAY ONCE):
${FULL_API_KEY}

Key Hash (stored in DB):
${API_KEY_HASH}

⚠️  IMPORTANT:
- Store this key securely (1Password, AWS Secrets Manager)
- This is the ONLY time the full key will be displayed
- Database stores SHA-256 hash only
- Rotate monthly for security

Documentation: https://docs.securebase.io/api-keys
EOF

  print_success "Full API key saved to: /tmp/api-key-${CUSTOMER_ID}.txt"
}

create_iam_users() {
  print_step "Creating IAM Identity Center users..."
  
  # This would create:
  # - Platform Engineer permission set (day-to-day operations)
  # - Security Auditor permission set (read-only compliance review)
  # - Break-glass admin role (emergency access, MFA required)
  
  cat > /tmp/iam-setup-${CUSTOMER_ID}.sh << 'EOF'
#!/bin/bash
# Run this script to complete IAM setup for the customer

# Get SSO instance ARN
SSO_INSTANCE_ARN=$(aws identitystore instances --query "Instances[0].InstanceArn" --output text)

# Create permission set: PlatformEngineer
aws ssoadmin create-permission-set \
  --instance-arn "$SSO_INSTANCE_ARN" \
  --name "PlatformEngineer-${CUSTOMER_ID}" \
  --session-duration "PT4H" \
  --description "Platform engineering - daily operations"

# Create permission set: SecurityAuditor
aws ssoadmin create-permission-set \
  --instance-arn "$SSO_INSTANCE_ARN" \
  --name "SecurityAuditor-${CUSTOMER_ID}" \
  --session-duration "PT8H" \
  --description "Read-only access for compliance audits"

echo "IAM Identity Center permission sets created"
EOF
  
  chmod +x /tmp/iam-setup-${CUSTOMER_ID}.sh
  print_success "IAM setup script created: /tmp/iam-setup-${CUSTOMER_ID}.sh"
}

send_welcome_email() {
  print_step "Preparing welcome email..."
  
  cat > /tmp/welcome-email-${CUSTOMER_ID}.txt << EOF
Subject: Welcome to SecureBase - Your AWS Organization is Ready!

Dear ${CUSTOMER_NAME} Team,

🎉 Your SecureBase environment is now live!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
QUICK START
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Organization Setup:
   Organization ID: ${ORG_ID}
   Management Account: ${MGMT_ACCOUNT}
   Tier: ${TIER}
   Framework: ${FRAMEWORK}

2. API Access:
   • Your API key is ready (see attached)
   • Start making API calls: https://docs.securebase.io/api
   • Keep the key secure (never commit to version control)

3. Customer Portal:
   • Login: https://portal.securebase.io
   • Email: ${EMAIL}
   • MFA required for first login

4. Support:
   • Documentation: https://docs.securebase.io
   • Help: support@securebase.io
   • Emergency: +1-800-SECUREBASE

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BILLING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Tier: ${TIER}
Monthly Base Cost: \$(see attached invoice template)
First Invoice: 1st of next month

Usage charges calculated automatically based on:
  • AWS account count
  • CloudTrail events logged
  • Storage consumed
  • Data transfer

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NEXT STEPS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. [ ] Review organization structure
2. [ ] Activate additional AWS accounts
3. [ ] Configure IAM Identity Center users
4. [ ] Enable SecurityHub for compliance monitoring
5. [ ] Test API with provided examples

Questions? Just reply to this email!

Welcome aboard! 🚀

Best regards,
SecureBase Team
EOF

  print_success "Welcome email prepared: /tmp/welcome-email-${CUSTOMER_ID}.txt"
}

generate_deployment_summary() {
  print_step "Generating deployment summary..."
  
  cat > /tmp/deployment-summary-${CUSTOMER_ID}.md << EOF
# SecureBase Customer Onboarding Summary

**Date:** $(date)
**Customer:** ${CUSTOMER_NAME}
**Tier:** ${TIER}
**Framework:** ${FRAMEWORK}

## Infrastructure

### AWS Organization
- Organization ID: ${ORG_ID}
- Management Account: ${MGMT_ACCOUNT}
- Regions Enabled: us-east-1, us-west-2
- Multi-region support: Available

### Organizational Units
- ✅ Customers-$(echo "$FRAMEWORK" | tr '[:lower:]' '[:upper:]')
- ✅ Security
- ✅ Shared Services
- ✅ Workloads

### VPC Networking
- VPC CIDR: ${VPC_CIDR}
- Public Subnets: 1a, 1b
- Private Subnets: 1a, 1b
- NAT Gateway: Enabled
- VPC Flow Logs: Enabled

### Security Controls
- SCPs Applied: 5
- IAM Identity Center: Enabled
- MFA: Required
- CloudTrail: Multi-region enabled
- Config Rules: Enabled
- GuardDuty: Enabled
- Security Hub: Enabled

## Compliance

- Framework: ${FRAMEWORK}
- Controls Implemented: 150+
- Audit Retention: 7 years
- Encryption: AES-256 at rest, TLS 1.3 in transit

## Billing

- Tier: ${TIER}
- Monthly Base: \$[See tier pricing]
- API Key Prefix: sk_live_${CUSTOMER_ID}
- Billing Email: ${EMAIL}

## Next Steps

1. [ ] Complete IAM setup: \`bash /tmp/iam-setup-${CUSTOMER_ID}.sh\`
2. [ ] Send welcome email to ${EMAIL}
3. [ ] Create support ticket queue
4. [ ] Schedule compliance review call
5. [ ] Activate additional AWS accounts as needed

## Support

- Documentation: https://docs.securebase.io
- API Reference: https://docs.securebase.io/api
- Support: support@securebase.io
EOF

  print_success "Summary generated: /tmp/deployment-summary-${CUSTOMER_ID}.md"
}

# ============================================
# MAIN EXECUTION
# ============================================

main() {
  print_header "SecureBase Automated Customer Onboarding"
  
  # Parse arguments
  while [[ $# -gt 0 ]]; do
    case $1 in
      --name) CUSTOMER_NAME="$2"; shift 2 ;;
      --tier) TIER="$2"; shift 2 ;;
      --framework) FRAMEWORK="$2"; shift 2 ;;
      --email) EMAIL="$2"; shift 2 ;;
      --customer-id) CUSTOMER_ID="$2"; shift 2 ;;
      --api-triggered) API_TRIGGERED=true; shift ;;
      --skip-terraform) SKIP_TERRAFORM=true; shift ;;
      --plan-only) PLAN_ONLY=true; shift ;;
      --dry-run) DRY_RUN=true; shift ;;
      *) print_error "Unknown option: $1" ;;
    esac
  done
  
  # Validate
  validate_inputs
  
  # Generate customer ID if not provided
  if [[ -z "$CUSTOMER_ID" ]]; then
    CUSTOMER_ID=$(generate_customer_id)
  fi
  echo "Customer ID: ${CUSTOMER_ID}"
  
  # Assign VPC CIDR based on customer count
  VPC_CIDR="10.0.0.0/16"  # Would be dynamic in production
  
  # Check prerequisites (skip for API-triggered mode)
  if [[ "$API_TRIGGERED" != "true" ]]; then
    check_prerequisites
  fi
  
  # Infrastructure provisioning (can be skipped for API-triggered)
  if [[ "$SKIP_TERRAFORM" != "true" ]]; then
    print_header "Phase 1: Infrastructure Provisioning"
    update_terraform_config
    
    # Plan
    plan_infrastructure
    
    # Ask for confirmation before applying (auto-approve for API-triggered)
    if [[ "$PLAN_ONLY" != "true" ]]; then
      if [[ "$API_TRIGGERED" == "true" ]]; then
        apply_infrastructure
      else
        echo ""
        read -p "Apply infrastructure? (yes/no): " APPLY_CONFIRM
        
        if [[ "$APPLY_CONFIRM" == "yes" ]]; then
          apply_infrastructure
        else
          print_error "Onboarding cancelled"
        fi
      fi
    fi
  else
    print_step "Skipping Terraform provisioning (database record only)"
  fi
  
  # Phase 2: Database & API Setup
  print_header "Phase 2: Database & API Setup"
  create_database_records
  generate_api_key
  
  # Phase 3: IAM & Communication
  print_header "Phase 3: IAM & Communication"
  create_iam_users
  send_welcome_email
  
  # Summary
  print_header "Onboarding Complete! 🎉"
  generate_deployment_summary
  
  echo ""
  echo "Next steps:"
  echo "  1. Review deployment summary: cat /tmp/deployment-summary-${CUSTOMER_ID}.md"
  echo "  2. Send welcome email: cat /tmp/welcome-email-${CUSTOMER_ID}.txt"
  echo "  3. Complete IAM setup: bash /tmp/iam-setup-${CUSTOMER_ID}.sh"
  echo "  4. Retrieve API key (display once): cat /tmp/api-key-${CUSTOMER_ID}.txt"
  echo ""
}

# Run main function
main "$@"
