variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "cluster_name" {
  type        = string
  description = "Existing EKS cluster name"
}

variable "namespace" {
  type    = string
  default = "terraplan"
}

variable "release_name" {
  type    = string
  default = "terraplan"
}

variable "secret_name" {
  type    = string
  default = "terraplan"
}

variable "runner_service_account" {
  type    = string
  default = "terraplan-runner"
}

variable "artifacts_bucket" {
  type        = string
  description = "Globally unique S3 bucket for plan/log artifacts"
}

variable "env_role_arns" {
  type        = list(string)
  description = "IAM role ARNs the runner may AssumeRole into (per-environment)"
  default     = ["*"]
}

variable "database_url" {
  type      = string
  sensitive = true
}

variable "redis_url" {
  type      = string
  sensitive = true
}

variable "session_secret" {
  type      = string
  sensitive = true
}

variable "google_client_id" {
  type    = string
  default = ""
}

variable "google_client_secret" {
  type      = string
  default   = ""
  sensitive = true
}

variable "credentials_encryption_key" {
  type      = string
  default   = ""
  sensitive = true
}

variable "slack_webhook_url" {
  type      = string
  default   = ""
  sensitive = true
}

variable "teams_webhook_url" {
  type      = string
  default   = ""
  sensitive = true
}

variable "bootstrap_admin_email" {
  type    = string
  default = "admin@example.com"
}

variable "images" {
  type = object({
    registry = optional(string, "")
    pullPolicy = optional(string, "IfNotPresent")
    web      = object({ repository = string, tag = string })
    api      = object({ repository = string, tag = string })
    runner   = object({ repository = string, tag = string })
  })
}

variable "config" {
  type    = map(string)
  default = {}
}

variable "ingress" {
  type    = any
  default = { enabled = true }
}

variable "web_replicas" {
  type    = number
  default = 2
}

variable "api_replicas" {
  type    = number
  default = 2
}

variable "runner_replicas" {
  type    = number
  default = 2
}

variable "tags" {
  type    = map(string)
  default = {}
}
