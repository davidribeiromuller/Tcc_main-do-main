import { defineConfig } from "drizzle-kit";
import * as dotenv from "dotenv";

// Load environment variables from .env file.
dotenv.config();

const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
const isUrlValid = databaseUrl && (databaseUrl.startsWith("postgres://") || databaseUrl.startsWith("postgresql://"));

const dbCredentials = isUrlValid 
  ? { url: databaseUrl, ssl: { rejectUnauthorized: false } }
  : {
      host: process.env.SQL_HOST || "",
      user: process.env.SQL_ADMIN_USER || process.env.SQL_USER || "",
      password: process.env.SQL_ADMIN_PASSWORD || process.env.SQL_PASSWORD || "",
      database: process.env.SQL_DB_NAME || "",
      ssl: false,
    };

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations", // let's output inside src/db/migrations or just ./drizzle
  dialect: "postgresql",
  schemaFilter: ["public"],
  dbCredentials,
  verbose: true,
});
