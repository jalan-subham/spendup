import { PrismaClient } from "./src/generated/prisma/index.js";

async function main() {
  try {
    const prisma = new PrismaClient({ log: ["error"] });
    await prisma.$connect();
    console.log("SUCCESS: Prisma connected!");
    process.exit(0);
  } catch (e) {
    console.error("FAILED:", e.message);
    process.exit(1);
  }
}
main();
