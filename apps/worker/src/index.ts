import dotenv from "dotenv";

dotenv.config();

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

console.log("BountyOps worker started");
console.log(`Redis URL: ${redisUrl}`);
