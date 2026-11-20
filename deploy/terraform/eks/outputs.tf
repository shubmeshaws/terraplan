output "artifacts_bucket" {
  value = aws_s3_bucket.artifacts.bucket
}

output "runner_role_arn" {
  value = aws_iam_role.runner.arn
}

output "namespace" {
  value = kubernetes_namespace.this.metadata[0].name
}

output "helm_release" {
  value = helm_release.terraplan.name
}
