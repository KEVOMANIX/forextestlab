-- Demo funds added to a session after it was blown. Mirrored from the engine
-- state so dashboard and history queries can measure profit against everything
-- the trader put in without parsing the full session snapshot.
ALTER TABLE "BacktestSession"
  ADD COLUMN "depositedFunds" TEXT NOT NULL DEFAULT '0';
