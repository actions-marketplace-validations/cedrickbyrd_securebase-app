# Mock Terraform resource triggering FFIEC CAT / HIPAA encryption violation
resource "aws_s3_bucket" "audit_log_test" {
  bucket        = "securebase-test-unencrypted-logs-bucket"
  force_destroy = true
}

resource "aws_s3_bucket_public_access_block" "audit_log_test" {
  bucket = aws_s3_bucket.audit_log_test.id

  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}
