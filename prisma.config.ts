import * as dotenv from "dotenv";
import path from "path";
import { defineConfig } from "prisma/config";

// Load .env.local (Next.js convention; standard dotenv would miss this)
dotenv.config({ path: path.resolve(__dirname, ".env.local") });

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL ?? `file:${path.join(__dirname, "prisma", "spendUp.db")}`,
  },
});
