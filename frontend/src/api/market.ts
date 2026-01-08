import { get } from "../utils/apiClient";

export type Asset = {
  id: string;
  symbol: string;
};

export type Candle = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type MarketSymbol = {
  label: string;
  symbol: string;
};

export type MarketOverviewItem = {
  label: string;
  symbol: string;
  price: number | null;
  change: number | null;
};

function getCandleAt(candles: Candle[], offsetFromEnd: number) {
  const index = candles.length + offsetFromEnd;
  return index >= 0 && index < candles.length ? candles[index] : undefined;
}

export async function fetchAssetSymbols(): Promise<string[]> {
  const assets = await get<Asset[]>("/api/assets");
  return assets.map((asset) => asset.symbol);
}

export async function fetchCandles(symbol: string): Promise<Candle[]> {
  const response = await get<{ candles: Candle[] }>(
    `/api/assets/candles?symbol=${encodeURIComponent(symbol)}`,
  );
  return response.candles;
}

export async function fetchMarketOverview(
  symbols: MarketSymbol[],
): Promise<MarketOverviewItem[]> {
  const results = await Promise.all(
    symbols.map(async (item) => {
      const candles = await fetchCandles(item.symbol);
      const latest = getCandleAt(candles, -1);
      const previous = getCandleAt(candles, -2);
      const price = latest?.close ?? null;
      const change =
        latest && previous ? ((latest.close - previous.close) / previous.close) * 100 : null;
      return { ...item, price, change };
    }),
  );

  return results;
}
