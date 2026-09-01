# MurphDuel

View-only fantasy football standings at [www.murphduel.com](https://www.murphduel.com). The site is static HTML, CSS, and JavaScript hosted in a private S3 bucket and served through CloudFront.

## Architecture

```text
GitHub main push
      │
      ▼
CodePipeline ──► CodeBuild ──► private S3 site bucket
                                      │
                                      ▼
Route 53 ──► CloudFront + ACM ──► Origin Access Control

murphduel-iam stack ──exports──► CodePipeline and CodeBuild role ARNs
```

AWS account: `314341330830`

Deployment region: `us-east-1` (required for the CloudFront ACM certificate)

Source: `cbgesbocker/murphduel`, branch `main`

## Repository layout

```text
site/                       Static website deployed to S3
  config.json               Optional published spreadsheet CSV URL
  leaderboard.json          Checked-in fallback data
infrastructure/
  template.yml              S3, CloudFront, ACM, Route 53, CodeBuild, CodePipeline
  buildspec.yml             Static-site publish and CloudFront invalidation
scripts/
  serve.mjs                 Dependency-free Node development server
  validate.mjs              Source and data checks
  deploy-infrastructure.sh  Application stack deployment
```

IAM is intentionally maintained in a separate `cbgesbocker/murphduel-iam` repository. Its singleton CloudFormation stack exports the two service-role ARNs consumed by this stack with `Fn::ImportValue`.

## Local development

Node.js 20 or newer is recommended. There are no third-party packages to install.

```bash
npm run dev
```

Open `http://127.0.0.1:8000`. To validate the JavaScript and league data:

```bash
npm test
```

## Spreadsheet data

The site supports a published CSV endpoint without granting visitors edit access. Set `googleSheetCsvUrl` in `site/config.json`:

```json
{
  "googleSheetCsvUrl": "https://docs.google.com/spreadsheets/d/e/PUBLISHED_ID/pub?output=csv"
}
```

The first row must contain these headers:

```csv
year,manager,teamName,points
2026,Conner,Fourth and Long,1847.50
```

Rows are grouped by year and sorted by points in the browser. If the URL is blank, the site loads `site/leaderboard.json` instead. A spreadsheet must be published for anonymous read access; do not put credentials or a private sheet URL in the site configuration.

## First deployment

1. Deploy the singleton `murphduel-iam` repository first:

   ```bash
   ./deploy.sh
   ```

2. From this repository, deploy the application stack:

   ```bash
   ./scripts/deploy-infrastructure.sh
   ```

3. The deployment script reuses the account's existing `sdm-react-source-code` GitHub connection, which is already `AVAILABLE`. Override `CONNECTION_ARN` if you want to use a different connection. If no connection ARN is passed to the template, CloudFormation creates `murphduel-github` in `PENDING` state and it must be authorized once in **Developer Tools → Settings → Connections**.

4. Release or retry the `murphduel-main` pipeline. Every subsequent push to `main` publishes `site/` to S3 and invalidates the CloudFront cache.

The application template defaults to the existing Route 53 hosted zone `Z018598227JM4USXA36E6` and serves both `murphduel.com` and `www.murphduel.com` over HTTPS.

## Stack ownership

- `murphduel-iam`: stable service roles and policies only. Change infrequently.
- `murphduel`: website hosting, certificate, DNS, GitHub connection, and delivery pipeline.

CloudFormation protects the IAM exports from deletion or incompatible changes while the application stack imports them. The S3 buckets use `Retain` policies so deleting a stack cannot silently delete league data or pipeline artifacts.
