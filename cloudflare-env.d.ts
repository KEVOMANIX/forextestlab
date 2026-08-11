interface CloudflareEnv {
  ASSETS?: Fetcher;
  HYPERDRIVE?: {
    connectionString: string;
  };
  MARKET_DATA?: MarketDataR2Bucket;
}

interface MarketDataR2Bucket {
  list(options: {
    prefix: string;
    cursor?: string;
  }): Promise<{
    objects: Array<{ key: string }>;
    truncated: boolean;
    cursor?: string;
  }>;
  get(key: string): Promise<{
    arrayBuffer(): Promise<ArrayBuffer>;
  } | null>;
}
