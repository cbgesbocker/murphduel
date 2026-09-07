import { CloudFrontClient, CreateInvalidationCommand } from "@aws-sdk/client-cloudfront";
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { parseLeagueData } from "./parser.mjs";

const s3 = new S3Client({});
const secrets = new SecretsManagerClient({});
const cloudFront = new CloudFrontClient({});
const sheetsApi = "https://sheets.googleapis.com/v4/spreadsheets";
const cooldownMilliseconds = 60_000;

function response(statusCode, payload) {
  return {
    statusCode,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload)
  };
}

function secretValue(secretString) {
  const value = String(secretString ?? "").trim();
  if (!value) throw new Error("The Google Sheets API key secret is empty");

  if (value.startsWith("{")) {
    const parsed = JSON.parse(value);
    const key = parsed.SHEETS_API_KEY ?? parsed.googleSheetApiKey ?? parsed.apiKey;
    if (key) return String(key).trim();
  }

  const envMatch = value.match(/^SHEETS_API_KEY=(.*)$/m);
  const key = (envMatch?.[1] ?? value).trim().replace(/^(['"])(.*)\1$/, "$2");
  if (!key) throw new Error("The Google Sheets API key secret is empty");
  return key;
}

async function getLastSync() {
  try {
    const object = await s3.send(new GetObjectCommand({
      Bucket: process.env.SITE_BUCKET,
      Key: "sync-status.json"
    }));
    return JSON.parse(await object.Body.transformToString());
  } catch (error) {
    if (error.name === "NoSuchKey" || error.$metadata?.httpStatusCode === 404) return null;
    throw error;
  }
}

async function requestGoogle(path, apiKey, params = []) {
  const url = new URL(`${sheetsApi}/${process.env.SPREADSHEET_ID}${path}`);
  params.forEach(([name, value]) => url.searchParams.append(name, value));
  url.searchParams.set("key", apiKey);

  const result = await fetch(url, { headers: { Referer: "https://www.murphduel.com/" } });
  if (!result.ok) {
    const body = await result.json().catch(() => ({}));
    throw new Error(body.error?.message || `Google Sheets returned ${result.status}`);
  }
  return result.json();
}

async function readSpreadsheet() {
  const secret = await secrets.send(new GetSecretValueCommand({ SecretId: process.env.SHEETS_SECRET_ARN }));
  const apiKey = secretValue(secret.SecretString);
  const metadata = await requestGoogle("", apiKey, [["fields", "sheets.properties(title)"]]);
  const titles = (metadata.sheets ?? [])
    .map((sheet) => sheet.properties?.title)
    .filter((title) => /^Fanduel \d{2}'$/.test(title));

  if (!titles.length) throw new Error("No Fanduel season tabs were found");

  const ranges = titles.map((title) => ["ranges", `'${title.replaceAll("'", "''")}'!A1:AH200`]);
  const values = await requestGoogle("/values:batchGet", apiKey, [
    ...ranges,
    ["majorDimension", "ROWS"],
    ["valueRenderOption", "FORMATTED_VALUE"]
  ]);
  const data = parseLeagueData(titles, values.valueRanges ?? []);
  if (!data.seasons.length) throw new Error("No live season data was found");
  return data;
}

async function saveData(data, syncedAt) {
  const years = data.seasons.map(({ year }) => year);
  const status = { syncedAt, years };

  await Promise.all([
    s3.send(new PutObjectCommand({
      Bucket: process.env.SITE_BUCKET,
      Key: "leaderboard.json",
      Body: `${JSON.stringify(data, null, 2)}\n`,
      ContentType: "application/json; charset=utf-8",
      CacheControl: "no-cache"
    })),
    s3.send(new PutObjectCommand({
      Bucket: process.env.SITE_BUCKET,
      Key: "sync-status.json",
      Body: `${JSON.stringify(status)}\n`,
      ContentType: "application/json; charset=utf-8",
      CacheControl: "no-store"
    }))
  ]);

  await cloudFront.send(new CreateInvalidationCommand({
    DistributionId: process.env.DISTRIBUTION_ID,
    InvalidationBatch: {
      CallerReference: `murphduel-sync-${syncedAt}`,
      Paths: { Quantity: 2, Items: ["/leaderboard.json", "/sync-status.json"] }
    }
  }));
  return status;
}

export async function handler(event = {}) {
  const trustedInvocation = event.source === "aws.scheduler" || event.source === "manual.deploy";
  if (!trustedInvocation) {
    if (event.requestContext?.http?.method !== "POST") {
      return response(405, { message: "Method not allowed" });
    }

    const origin = event.headers?.origin ?? event.headers?.Origin;
    const allowedOrigins = new Set(String(process.env.ALLOWED_ORIGINS ?? "").split(",").filter(Boolean));
    if (!allowedOrigins.has(origin)) return response(403, { message: "Origin not allowed" });
  }

  try {
    const lastSync = await getLastSync();
    const lastSyncTime = Date.parse(lastSync?.syncedAt ?? "");
    if (!trustedInvocation && Number.isFinite(lastSyncTime) && Date.now() - lastSyncTime < cooldownMilliseconds) {
      return response(200, { status: "recent", ...lastSync });
    }

    const data = await readSpreadsheet();
    const syncedAt = new Date().toISOString();
    const status = await saveData(data, syncedAt);
    return response(200, {
      status: "synced",
      ...status,
      weeks: data.seasons.reduce((total, season) => total + season.weeks.length, 0)
    });
  } catch (error) {
    console.error("MurphDuel spreadsheet sync failed", error);
    return response(500, { message: "The spreadsheet could not be synced" });
  }
}
