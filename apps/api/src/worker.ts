import { startPaymentWorker, closeQueue } from "./lib/queue.js";
import { handlePaymentStatus } from "./services/order-fulfillment.js";
import { prisma } from "./prisma.js";
import { config } from "./config.js";

if (!config.rabbitmqUrl) {
  console.error("RABBITMQ_URL is required for the order worker");
  process.exit(1);
}

await startPaymentWorker(handlePaymentStatus);

async function shutdown() {
  await closeQueue();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGTERM", () => {
  void shutdown();
});
process.on("SIGINT", () => {
  void shutdown();
});
