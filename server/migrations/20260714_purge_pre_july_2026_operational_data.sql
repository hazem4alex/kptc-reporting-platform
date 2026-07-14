DELETE FROM transactions
WHERE COALESCE(
  CASE
    WHEN transaction_datetime_raw ~ '^\d{14}$' THEN
      (
        make_timestamp(
          substring(transaction_datetime_raw from 1 for 4)::int,
          substring(transaction_datetime_raw from 5 for 2)::int,
          substring(transaction_datetime_raw from 7 for 2)::int,
          substring(transaction_datetime_raw from 9 for 2)::int,
          substring(transaction_datetime_raw from 11 for 2)::int,
          substring(transaction_datetime_raw from 13 for 2)::int
        ) + (-5 * interval '1 hour')
      )::date
    ELSE NULL
  END,
  (transaction_datetime AT TIME ZONE 'Asia/Kuwait')::date,
  (received_at AT TIME ZONE 'Asia/Kuwait')::date
) < DATE '2026-07-01';

DELETE FROM bus_locations
WHERE COALESCE(
  (location_time AT TIME ZONE 'Asia/Kuwait')::date,
  (received_at AT TIME ZONE 'Asia/Kuwait')::date
) < DATE '2026-07-01';
