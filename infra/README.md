# Infrastructure

Terraform and `gcloud` scripts for Cloud Run, Firestore, Vertex AI Search, IAM, Secret
Manager, and backups belong here.

The scaffold does not provision GCP resources. Add infrastructure only when the setup
milestone begins, and keep the KB service identity read-only for Drive folders plus
send-only for `KB Approval` notifications.
