# terraplan on EKS (Terraform module)

Deploys the Helm chart onto an **existing** EKS cluster and provisions:

- S3 artifacts bucket (SSE-KMS, versioned, public access blocked)
- IRSA role for the runner (`sts:AssumeRole` into env account roles + S3)
- Kubernetes namespace + Secret
- `helm_release` of `deploy/helm/terraplan`

## Prerequisites

- EKS cluster with OIDC provider enabled
- RDS Postgres + ElastiCache Redis (or equivalents) reachable from the cluster
- Container images pushed to ECR (or another registry)
- AWS ALB Ingress Controller (if using the default ingress annotations)

## Usage

```hcl
module "terraplan" {
  source = "./deploy/terraform/eks"

  aws_region   = "ap-south-1"
  cluster_name = "platform-eks"
  artifacts_bucket = "company-terraplan-artifacts"

  database_url  = var.database_url
  redis_url     = var.redis_url
  session_secret = var.session_secret

  google_client_id     = var.google_client_id
  google_client_secret = var.google_client_secret
  bootstrap_admin_email = "platform@company.com"

  env_role_arns = [
    "arn:aws:iam::111122223333:role/terraplan-dev",
    "arn:aws:iam::777788889999:role/terraplan-prod",
  ]

  images = {
    web    = { repository = "111122223333.dkr.ecr.ap-south-1.amazonaws.com/terraplan-web", tag = "0.1.0" }
    api    = { repository = "111122223333.dkr.ecr.ap-south-1.amazonaws.com/terraplan-api", tag = "0.1.0" }
    runner = { repository = "111122223333.dkr.ecr.ap-south-1.amazonaws.com/terraplan-runner", tag = "0.1.0" }
  }

  config = {
    WEB_PUBLIC_URL = "https://terraplan.company.com"
    API_PUBLIC_URL = "https://api.terraplan.company.com"
    CORS_ORIGIN    = "https://terraplan.company.com"
    RUNNER_MODE    = "terraform"
  }
}
```

See [docs/RUNBOOK.md](../../../docs/RUNBOOK.md) for day-2 operations.
