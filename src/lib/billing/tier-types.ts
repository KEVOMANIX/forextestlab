export type BillingInterval = "month" | "year";
export type TierId = "starter" | "pro" | "advanced";

export interface Tier {
  id: TierId;
  name: "Starter" | "Pro" | "Advanced";
  description: string;
  features: string[];
  featured: boolean;
  priceId: { month: string; year: string };
}

export type PaddleTierProductKey = `${TierId}_${BillingInterval}`;
