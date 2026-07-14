BEGIN;

CREATE TABLE IF NOT EXISTS card_type_definitions (
  card_type text PRIMARY KEY,
  is_driver_card boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Card type 0500 is the E60 driver card type. ON CONFLICT DO NOTHING keeps
-- later administrator changes intact when the migration is replayed safely.
INSERT INTO card_type_definitions (card_type, is_driver_card)
VALUES ('0500', true)
ON CONFLICT (card_type) DO NOTHING;

INSERT INTO card_type_definitions (card_type)
SELECT DISTINCT card_type
FROM transactions
WHERE card_type IS NOT NULL AND btrim(card_type) <> ''
ON CONFLICT (card_type) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_transactions_driver_events
  ON transactions(card_type, record_type, transaction_datetime DESC);

COMMIT;
