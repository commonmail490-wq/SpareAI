-- Align consumption_log dates from spareai_real_data.sql so the latest month
-- falls within the rolling lookback window (run after loading seed data).
USE spareai;

SET @max_dt := (SELECT MAX(consumption_date) FROM consumption_log);
SET @shift_days := DATEDIFF(DATE_SUB(CURDATE(), INTERVAL 15 DAY), @max_dt);

SELECT @max_dt AS max_date_before, @shift_days AS days_to_shift;

UPDATE consumption_log
SET consumption_date = DATE_ADD(consumption_date, INTERVAL @shift_days DAY);

SELECT MIN(consumption_date) AS min_date_after,
       MAX(consumption_date) AS max_date_after,
       COUNT(*) AS rows_in_last_90_days
FROM consumption_log
WHERE consumption_date >= (CURDATE() - INTERVAL 90 DAY);
