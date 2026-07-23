import { config } from "dotenv";

config({ path: ".env.local" });
config();

async function main() {
  const { prisma } = await import("../src/lib/db");
  try {
    const [profiles, subscriptions, payments, webhookEvents] =
      await Promise.all([
        prisma.userProfile.count(),
        prisma.billingSubscription.count({ where: { provider: "paddle" } }),
        prisma.billingPayment.count({ where: { provider: "paddle" } }),
        prisma.billingWebhookEvent.count({ where: { provider: "paddle" } }),
      ]);

    console.log(
      JSON.stringify({
        databaseConnected: true,
        profiles,
        paddleSubscriptions: subscriptions,
        paddlePayments: payments,
        paddleWebhookEvents: webhookEvents,
      }),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
