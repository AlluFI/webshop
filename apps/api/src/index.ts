import { createApp } from "./app.js";
import { config } from "./config.js";
import { prisma } from "./prisma.js";
import { redis } from "./redis.js";
import { closeQueue } from "./lib/queue.js";

const app = createApp();

const server = app.listen(config.port, () => {
  console.log(`Volt & Co API listening on :${config.port}`);
});

async function shutdown() {
  server.close();
  await closeQueue();
  await prisma.$disconnect();
  redis.disconnect();
}

process.on("SIGTERM", () => {
  void shutdown();
});
process.on("SIGINT", () => {
  void shutdown();
});
