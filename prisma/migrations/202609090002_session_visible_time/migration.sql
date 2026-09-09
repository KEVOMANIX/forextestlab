-- Market timestamp of the candle the replay is currently showing.
--
-- Dashboard and history views report progress in trading days, which needs the
-- replay clock. Deriving it from visibleIndex x timeframe assumes candles are
-- contiguous and so understates elapsed time across every weekend and holiday.
-- Null on sessions saved before this column existed; readers fall back to the
-- old estimate.
ALTER TABLE "BacktestSession"
  ADD COLUMN "visibleTime" BIGINT;
