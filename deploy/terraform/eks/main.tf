terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = ">= 2.25"
    }
    helm = {
      source  = "hashicorp/helm"
      version = ">= 2.12"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

data "aws_eks_cluster" "this" {
  name = var.cluster_name
}

data "aws_eks_cluster_auth" "this" {
  name = var.cluster_name
}

provider "kubernetes" {
  host                   = data.aws_eks_cluster.this.endpoint
  cluster_ca_certificate = base64decode(data.aws_eks_cluster.this.certificate_authority[0].data)
  token                  = data.aws_eks_cluster_auth.this.token
}

provider "helm" {
  kubernetes {
    host                   = data.aws_eks_cluster.this.endpoint
    cluster_ca_certificate = base64decode(data.aws_eks_cluster.this.certificate_authority[0].data)
    token                  = data.aws_eks_cluster_auth.this.token
  }
}

locals {
  name = var.release_name
  tags = merge(var.tags, { "app.kubernetes.io/name" = "terraplan" })
}

# ── Artifacts bucket ─────────────────────────────────────────────
resource "aws_s3_bucket" "artifacts" {
  bucket = var.artifacts_bucket
  tags   = local.tags
}

resource "aws_s3_bucket_versioning" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "aws:kms"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "artifacts" {
  bucket                  = aws_s3_bucket.artifacts.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ── IRSA for runner (S3 + STS AssumeRole into env accounts) ──────
data "aws_iam_openid_connect_provider" "eks" {
  url = data.aws_eks_cluster.this.identity[0].oidc[0].issuer
}

data "aws_iam_policy_document" "runner_assume" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    effect  = "Allow"
    principals {
      type        = "Federated"
      identifiers = [data.aws_iam_openid_connect_provider.eks.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "${replace(data.aws_iam_openid_connect_provider.eks.url, "https://", "")}:sub"
      values   = ["system:serviceaccount:${var.namespace}:${var.runner_service_account}"]
    }
  }
}

resource "aws_iam_role" "runner" {
  name               = "${local.name}-runner"
  assume_role_policy = data.aws_iam_policy_document.runner_assume.json
  tags               = local.tags
}

data "aws_iam_policy_document" "runner" {
  statement {
    sid     = "Artifacts"
    actions = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"]
    resources = [
      aws_s3_bucket.artifacts.arn,
      "${aws_s3_bucket.artifacts.arn}/*",
    ]
  }
  statement {
    sid       = "AssumeEnvRoles"
    actions   = ["sts:AssumeRole"]
    resources = var.env_role_arns
  }
}

resource "aws_iam_role_policy" "runner" {
  name   = "${local.name}-runner"
  role   = aws_iam_role.runner.id
  policy = data.aws_iam_policy_document.runner.json
}

resource "kubernetes_namespace" "this" {
  metadata {
    name = var.namespace
    labels = {
      "app.kubernetes.io/name" = "terraplan"
    }
  }
}

resource "kubernetes_secret" "terraplan" {
  metadata {
    name      = var.secret_name
    namespace = kubernetes_namespace.this.metadata[0].name
  }
  data = {
    SESSION_SECRET              = var.session_secret
    DATABASE_URL                = var.database_url
    REDIS_URL                   = var.redis_url
    GOOGLE_CLIENT_ID            = var.google_client_id
    GOOGLE_CLIENT_SECRET        = var.google_client_secret
    CREDENTIALS_ENCRYPTION_KEY  = var.credentials_encryption_key
    SLACK_WEBHOOK_URL           = var.slack_webhook_url
    TEAMS_WEBHOOK_URL           = var.teams_webhook_url
    ARTIFACTS_S3_BUCKET         = aws_s3_bucket.artifacts.bucket
    AUTH_BOOTSTRAP_ADMIN_EMAIL  = var.bootstrap_admin_email
  }
  type = "Opaque"
}

resource "helm_release" "terraplan" {
  name       = var.release_name
  namespace  = kubernetes_namespace.this.metadata[0].name
  chart      = "${path.module}/../../helm/terraplan"
  depends_on = [kubernetes_secret.terraplan]

  values = [
    yamlencode({
      image = var.images
      config = merge(var.config, {
        ARTIFACTS_S3_BUCKET = aws_s3_bucket.artifacts.bucket
        ARTIFACTS_S3_REGION = var.aws_region
      })
      secretName    = var.secret_name
      createSecret  = false
      ingress       = var.ingress
      runner = {
        replicas = var.runner_replicas
        serviceAccount = {
          create = true
          name   = var.runner_service_account
          annotations = {
            "eks.amazonaws.com/role-arn" = aws_iam_role.runner.arn
          }
        }
      }
      api = { replicas = var.api_replicas }
      web = { replicas = var.web_replicas }
    })
  ]
}
