-- Economic calendar releases, imported from MetaTrader 5's built-in calendar.
CREATE TABLE "EconomicEvent" (
  "id"              TEXT NOT NULL,
  "source"          TEXT NOT NULL DEFAULT 'mt5',
  "externalId"      TEXT NOT NULL,
  "seriesId"        TEXT,
  "eventCode"       TEXT,
  "name"            TEXT NOT NULL,
  "currency"        TEXT NOT NULL,
  "country"         TEXT,
  "importance"      TEXT NOT NULL,
  "timestamp"       BIGINT NOT NULL,
  "timeMode"        TEXT NOT NULL DEFAULT 'exact',
  "period"          BIGINT,
  "actual"          TEXT,
  "forecast"        TEXT,
  "previous"        TEXT,
  "revisedPrevious" TEXT,
  "unit"            TEXT,
  "multiplier"      TEXT,
  "digits"          INTEGER NOT NULL DEFAULT 0,
  "revision"        INTEGER NOT NULL DEFAULT 0,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EconomicEvent_pkey" PRIMARY KEY ("id")
);

-- Re-running an export must update releases in place, not duplicate them.
CREATE UNIQUE INDEX "EconomicEvent_source_externalId_key"
  ON "EconomicEvent"("source", "externalId");

CREATE INDEX "EconomicEvent_timestamp_idx"
  ON "EconomicEvent"("timestamp");
CREATE INDEX "EconomicEvent_currency_timestamp_idx"
  ON "EconomicEvent"("currency", "timestamp");
CREATE INDEX "EconomicEvent_importance_timestamp_idx"
  ON "EconomicEvent"("importance", "timestamp");
