import amqp from "amqplib";
import {
  PAYMENT_STATUS_DLQ,
  PAYMENT_STATUS_QUEUE,
  type PaymentStatusMessage,
} from "@volt/shared";
import { config } from "../config.js";

const DLX = "volt.payments.dlx";

type Handler = (message: PaymentStatusMessage) => Promise<unknown>;

let handler: Handler | null = null;
let connection: Awaited<ReturnType<typeof amqp.connect>> | null = null;
let channel: amqp.Channel | null = null;

export function setPaymentStatusHandler(next: Handler | null) {
  handler = next;
}

export function queueInline() {
  return config.queueInline;
}

async function topology(ch: amqp.Channel) {
  await ch.assertExchange(DLX, "fanout", { durable: true });
  await ch.assertQueue(PAYMENT_STATUS_DLQ, { durable: true });
  await ch.bindQueue(PAYMENT_STATUS_DLQ, DLX, "");
  await ch.assertQueue(PAYMENT_STATUS_QUEUE, {
    durable: true,
    arguments: { "x-dead-letter-exchange": DLX },
  });
}

async function getChannel() {
  if (channel) return channel;
  if (!config.rabbitmqUrl) {
    throw new Error("RABBITMQ_URL is not set");
  }
  connection = await amqp.connect(config.rabbitmqUrl);
  connection.on("close", () => {
    connection = null;
    channel = null;
  });
  connection.on("error", (error) => {
    console.warn("[queue] connection error", error);
  });
  const next = await connection.createChannel();
  await topology(next);
  channel = next;
  return next;
}

export async function publishPaymentStatus(message: PaymentStatusMessage) {
  if (queueInline()) {
    if (!handler) {
      throw new Error("Payment status handler is not registered");
    }
    await handler(message);
    return;
  }
  const ch = await getChannel();
  const payload = Buffer.from(JSON.stringify(message));
  const ok = ch.sendToQueue(PAYMENT_STATUS_QUEUE, payload, { persistent: true });
  if (!ok) {
    throw new Error("RabbitMQ buffer full");
  }
}

export async function startPaymentWorker(handle: Handler) {
  setPaymentStatusHandler(handle);
  const ch = await getChannel();
  await ch.prefetch(1);
  console.info(`[worker] consuming ${PAYMENT_STATUS_QUEUE}`);
  await ch.consume(PAYMENT_STATUS_QUEUE, async (raw) => {
    if (!raw) return;
    try {
      const message = JSON.parse(raw.content.toString()) as PaymentStatusMessage;
      console.info(`[worker] ${message.outcome} order=${message.orderId}`);
      await handle(message);
      ch.ack(raw);
    } catch (error) {
      console.error("[worker] handler failed; routing to DLQ", error);
      ch.nack(raw, false, false);
    }
  });
}

export async function rabbitReachable() {
  if (!config.rabbitmqUrl) return false;
  try {
    const ch = await getChannel();
    return Boolean(ch);
  } catch {
    channel = null;
    connection = null;
    return false;
  }
}

export async function closeQueue() {
  try {
    await channel?.close();
  } catch {
    /* ignore */
  }
  try {
    await connection?.close();
  } catch {
    /* ignore */
  }
  channel = null;
  connection = null;
}
