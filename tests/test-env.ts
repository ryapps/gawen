import "dotenv/config";
import { spawnSync } from "node:child_process";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error("TEST_DATABASE_URL must point to a dedicated test database.");
}

const testUrl = new URL(testDatabaseUrl);
const testDatabaseName = decodeURIComponent(testUrl.pathname.slice(1));
if (!/(^|[_-])test($|[_-])/i.test(testDatabaseName)) {
  throw new Error("TEST_DATABASE_URL database name must include a test suffix.");
}

const configuredDatabaseUrl = process.env.DATABASE_URL;
if (configuredDatabaseUrl) {
  const configuredUrl = new URL(configuredDatabaseUrl);
  const sameDatabase =
    configuredUrl.hostname === testUrl.hostname &&
    configuredUrl.port === testUrl.port &&
    configuredUrl.pathname === testUrl.pathname;
  if (sameDatabase) {
    throw new Error(
      "TEST_DATABASE_URL must not point to the configured application database.",
    );
  }
}

process.env.DATABASE_URL = testDatabaseUrl;
process.env.TRUST_PROXY_HOPS = "1";

const migration = spawnSync(
  process.execPath,
  ["node_modules/prisma/build/index.js", "migrate", "deploy"],
  { cwd: process.cwd(), env: process.env, stdio: "inherit" },
);
if (migration.status !== 0) {
  throw new Error("Could not apply migrations to the dedicated test database.");
}
