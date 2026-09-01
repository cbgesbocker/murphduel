#!/usr/bin/env bash
set -euo pipefail

EXPECTED_ACCOUNT="314341330830"
REGION="${AWS_REGION:-us-east-1}"
STACK_NAME="${STACK_NAME:-murphduel}"
CONNECTION_ARN="${CONNECTION_ARN:-arn:aws:codeconnections:us-east-1:314341330830:connection/41cdde2d-4455-42b3-adfb-bf659424d306}"

if [[ "$REGION" != "us-east-1" ]]; then
  echo "MurphDuel must be deployed in us-east-1 because CloudFront requires its ACM certificate there." >&2
  exit 1
fi

ACTIVE_ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
if [[ "$ACTIVE_ACCOUNT" != "$EXPECTED_ACCOUNT" ]]; then
  echo "Expected AWS account ${EXPECTED_ACCOUNT}, but the active account is ${ACTIVE_ACCOUNT}." >&2
  exit 1
fi

aws cloudformation deploy \
  --region "$REGION" \
  --stack-name "$STACK_NAME" \
  --template-file infrastructure/template.yml \
  --parameter-overrides ConnectionArn="$CONNECTION_ARN" \
  --no-fail-on-empty-changeset

aws cloudformation describe-stacks \
  --region "$REGION" \
  --stack-name "$STACK_NAME" \
  --query 'Stacks[0].Outputs' \
  --output table
