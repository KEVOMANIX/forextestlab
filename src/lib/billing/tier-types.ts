export type BillingInterval = "month" | "year";
export type TierId = "pro";

export interface Tier {
  id: TierId;
  name: "Pro";
  description: string;
  features: string[];
  featured: boolean;
  priceId: { month: string; year: string };
}

export type PaddleTierProductKey = `${TierId}_${BillingInterval}`;
