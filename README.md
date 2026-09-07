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
  index.html                Weekly winners, losers, and money ledger
  standings.html            Final standings and league history
  config.json               Optional published spreadsheet CSV URL
  leaderboard.json          Checked-in fallback data
  season.html               Legacy Weekly Money URL
infrastructure/
  template.yml              S3, CloudFront, ACM, Route 53, CodeBuild, CodePipeline
  buildspec.yml             Static-site publish and CloudFront invalidation
scripts/
  serve.mjs                 Dependency-free Node development server
  sync-sheets.mjs           Imports final standings through the Google Sheets API
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

The live site reads the public workbook `Copy of Fanduel 26'` directly on each visit. It asks the Google Sheets API for the workbook's actual tab list, reads every tab named like `Fanduel 26'`, and treats weekly payouts and final placement as independent sections. A newly added, correctly named season tab appears on the weekly-money page without a site deployment even when it has no final-placement table. It appears on the standings page once final standings are present. If Google is unavailable, the site falls back to the checked-in `site/leaderboard.json` data.

The production `config.json` is preserved outside source control because it contains the browser-restricted Sheets API key. The key must remain limited to the Google Sheets API and the MurphDuel website referrers.

The saved fallback can still be refreshed through the Google Sheets API without exposing the API key to visitors. The importer discovers every matching season tab and writes `site/leaderboard.json`.

Store the key in the ignored `.env` file, then refresh the saved standings:

```bash
npm run sync-data
```

The key must be restricted to the Google Sheets API and the `https://www.murphduel.com/*` referrer.

### Optional published CSV

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

Rows are grouped by year and sorted by points in the browser. If the URL is blank or the published spreadsheet is temporarily unavailable, the site loads `site/leaderboard.json` instead and labels the standings as saved data. A spreadsheet must be published for anonymous read access; do not put credentials or a private sheet URL in the site configuration.

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
