#!/usr/bin/env bash
set -euo pipefail

EXPECTED_ACCOUNT="314341330830"
REGION="${AWS_REGION:-us-east-1}"
STACK_NAME="${STACK_NAME:-murphduel}"
CONNECTION_ARN="${CONNECTION_ARN:-arn:aws:codeconnections:us-east-1:314341330830:connection/41cdde2d-4455-42b3-adfb-bf659424d306}"
SECRET_NAME="${SHEETS_SECRET_NAME:-murphduel/google-sheets-api-key}"
SHEETS_API_KEY="${SHEETS_API_KEY:-}"

if [[ "$REGION" != "us-east-1" ]]; then
  echo "MurphDuel must be deployed in us-east-1 because CloudFront requires its ACM certificate there." >&2
  exit 1
fi

ACTIVE_ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
if [[ "$ACTIVE_ACCOUNT" != "$EXPECTED_ACCOUNT" ]]; then
  echo "Expected AWS account ${EXPECTED_ACCOUNT}, but the active account is ${ACTIVE_ACCOUNT}." >&2
  exit 1
fi

if [[ -z "$SHEETS_API_KEY" && -f .env ]]; then
  while IFS= read -r line || [[ -n "$line" ]]; do
    if [[ "$line" == SHEETS_API_KEY=* ]]; then
      SHEETS_API_KEY="${line#SHEETS_API_KEY=}"
      break
    fi
  done < .env
fi

SHEETS_API_KEY="${SHEETS_API_KEY#\"}"
SHEETS_API_KEY="${SHEETS_API_KEY%\"}"
SHEETS_API_KEY="${SHEETS_API_KEY#\'}"
SHEETS_API_KEY="${SHEETS_API_KEY%\'}"
if [[ -z "$SHEETS_API_KEY" ]]; then
  echo "SHEETS_API_KEY is required in the environment or .env file." >&2
  exit 1
fi

ARTIFACT_BUCKET="$(aws cloudformation describe-stack-resource \
  --region "$REGION" \
  --stack-name "$STACK_NAME" \
  --logical-resource-id ArtifactBucket \
  --query 'StackResourceDetail.PhysicalResourceId' \
  --output text)"

SYNC_TEMP_DIR="$(mktemp -d /tmp/murphduel-sync.XXXXXX)"
trap 'rm -rf "$SYNC_TEMP_DIR"' EXIT
cp backend/sync/index.mjs backend/sync/parser.mjs "$SYNC_TEMP_DIR/"
SYNC_ARCHIVE="$SYNC_TEMP_DIR/murphduel-sheet-sync.zip"
(
  cd "$SYNC_TEMP_DIR"
  zip -q "$SYNC_ARCHIVE" index.mjs parser.mjs
)
SYNC_HASH="$(shasum -a 256 "$SYNC_ARCHIVE")"
SYNC_HASH="${SYNC_HASH%% *}"
SYNC_CODE_KEY="lambda/murphduel-sheet-sync-${SYNC_HASH}.zip"
aws s3 cp "$SYNC_ARCHIVE" "s3://${ARTIFACT_BUCKET}/${SYNC_CODE_KEY}" --only-show-errors

KEY_FILE="$SYNC_TEMP_DIR/sheets-api-key"
printf '%s' "$SHEETS_API_KEY" > "$KEY_FILE"
chmod 600 "$KEY_FILE"
if aws secretsmanager describe-secret --region "$REGION" --secret-id "$SECRET_NAME" >/dev/null 2>&1; then
  SECRET_ARN="$(aws secretsmanager put-secret-value \
    --region "$REGION" \
    --secret-id "$SECRET_NAME" \
    --secret-string "file://${KEY_FILE}" \
    --query ARN \
    --output text)"
else
  SECRET_ARN="$(aws secretsmanager create-secret \
    --region "$REGION" \
    --name "$SECRET_NAME" \
    --description "Google Sheets API key used by the MurphDuel sync Lambda" \
    --secret-string "file://${KEY_FILE}" \
    --query ARN \
    --output text)"
fi

aws cloudformation deploy \
  --region "$REGION" \
  --stack-name "$STACK_NAME" \
  --template-file infrastructure/template.yml \
  --parameter-overrides \
    ConnectionArn="$CONNECTION_ARN" \
    LambdaCodeBucket="$ARTIFACT_BUCKET" \
    LambdaCodeKey="$SYNC_CODE_KEY" \
    SheetsApiKeySecretArn="$SECRET_ARN" \
  --capabilities CAPABILITY_IAM \
  --no-fail-on-empty-changeset

SITE_BUCKET="$(aws cloudformation describe-stacks \
  --region "$REGION" \
  --stack-name "$STACK_NAME" \
  --query 'Stacks[0].Outputs[?OutputKey==`SiteBucketName`].OutputValue | [0]' \
  --output text)"
SYNC_ENDPOINT="$(aws cloudformation describe-stacks \
  --region "$REGION" \
  --stack-name "$STACK_NAME" \
  --query 'Stacks[0].Outputs[?OutputKey==`SyncEndpoint`].OutputValue | [0]' \
  --output text)"
SYNC_FUNCTION_NAME="$(aws cloudformation describe-stacks \
  --region "$REGION" \
  --stack-name "$STACK_NAME" \
  --query 'Stacks[0].Outputs[?OutputKey==`SyncFunctionName`].OutputValue | [0]' \
  --output text)"

CONFIG_FILE="$SYNC_TEMP_DIR/config.json"
SYNC_ENDPOINT="$SYNC_ENDPOINT" CONFIG_FILE="$CONFIG_FILE" node --input-type=module -e '
  import { writeFileSync } from "node:fs";
  writeFileSync(process.env.CONFIG_FILE, `${JSON.stringify({ syncEndpoint: process.env.SYNC_ENDPOINT }, null, 2)}\n`);
'
aws s3 cp "$CONFIG_FILE" "s3://${SITE_BUCKET}/config.json" \
  --content-type "application/json; charset=utf-8" \
  --cache-control "no-cache" \
  --only-show-errors

aws lambda invoke \
  --region "$REGION" \
  --function-name "$SYNC_FUNCTION_NAME" \
  --cli-binary-format raw-in-base64-out \
  --payload '{"source":"manual.deploy"}' \
  "$SYNC_TEMP_DIR/sync-response.json" \
  --query StatusCode \
  --output text >/dev/null
node --input-type=module -e '
  import { readFileSync } from "node:fs";
  const result = JSON.parse(readFileSync(process.argv[1], "utf8"));
  if (result.statusCode !== 200) throw new Error("The initial spreadsheet sync failed");
' "$SYNC_TEMP_DIR/sync-response.json"

DISTRIBUTION_ID="$(aws cloudformation describe-stacks \
  --region "$REGION" \
  --stack-name "$STACK_NAME" \
  --query 'Stacks[0].Outputs[?OutputKey==`DistributionId`].OutputValue | [0]' \
  --output text)"
aws cloudfront create-invalidation \
  --distribution-id "$DISTRIBUTION_ID" \
  --paths "/config.json" \
  --query 'Invalidation.Id' \
  --output text >/dev/null

aws cloudformation describe-stacks \
  --region "$REGION" \
  --stack-name "$STACK_NAME" \
  --query 'Stacks[0].Outputs' \
  --output table
