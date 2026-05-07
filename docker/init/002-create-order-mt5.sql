CREATE DATABASE IF NOT EXISTS stat_ms;

USE stat_ms;

CREATE TABLE IF NOT EXISTS order_mt5 (
  ticket BIGINT UNSIGNED NOT NULL,
  login BIGINT UNSIGNED NOT NULL,
  symbol VARCHAR(16) NOT NULL,
  cmd TINYINT UNSIGNED NOT NULL,
  volume INT UNSIGNED NOT NULL,
  open_time BIGINT UNSIGNED NOT NULL,
  close_time BIGINT UNSIGNED NULL,
  `time` BIGINT UNSIGNED NOT NULL,
  open_price DECIMAL(18, 5) NOT NULL,
  close_price DECIMAL(18, 5) NULL,
  sl DECIMAL(18, 5) NOT NULL DEFAULT 0,
  tp DECIMAL(18, 5) NOT NULL DEFAULT 0,
  profit DECIMAL(18, 2) NOT NULL DEFAULT 0,
  comment VARCHAR(64) NULL,
  PRIMARY KEY (ticket),
  KEY idx_order_mt5_time (`time`),
  KEY idx_order_mt5_open_time (open_time),
  KEY idx_order_mt5_login_time (login, `time`)
);

INSERT IGNORE INTO order_mt5 (
  ticket,
  login,
  symbol,
  cmd,
  volume,
  open_time,
  close_time,
  `time`,
  open_price,
  close_price,
  sl,
  tp,
  profit,
  comment
)
SELECT
  2000000 + sequence_numbers.seq AS ticket,
  50000 + (sequence_numbers.seq % 5000) AS login,
  ELT((sequence_numbers.seq % 10) + 1, 'EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'AUDUSD', 'USDCHF', 'EURJPY', 'USDCAD', 'NZDUSD', 'EURGBP') AS symbol,
  sequence_numbers.seq % 2 AS cmd,
  ((sequence_numbers.seq % 20) + 1) * 10 AS volume,
  CAST(UNIX_TIMESTAMP(TIMESTAMPADD(MINUTE, sequence_numbers.seq % 1052640, '2020-01-01 00:00:00')) AS UNSIGNED) AS open_time,
  CAST(UNIX_TIMESTAMP(TIMESTAMPADD(MINUTE, (sequence_numbers.seq % 1052640) + 5 + (sequence_numbers.seq % 720), '2020-01-01 00:00:00')) AS UNSIGNED) AS close_time,
  CAST(UNIX_TIMESTAMP(TIMESTAMPADD(MINUTE, sequence_numbers.seq % 1052640, '2020-01-01 00:00:00')) AS UNSIGNED) AS `time`,
  CAST(
    CASE sequence_numbers.seq % 10
      WHEN 0 THEN 1.08000 + ((sequence_numbers.seq % 9000) / 100000.0)
      WHEN 1 THEN 1.22000 + ((sequence_numbers.seq % 8500) / 100000.0)
      WHEN 2 THEN 102.00000 + ((sequence_numbers.seq % 90000) / 1000.0)
      WHEN 3 THEN 1650.00000 + ((sequence_numbers.seq % 90000) / 100.0)
      WHEN 4 THEN 0.62000 + ((sequence_numbers.seq % 6000) / 100000.0)
      WHEN 5 THEN 0.88000 + ((sequence_numbers.seq % 7500) / 100000.0)
      WHEN 6 THEN 118.00000 + ((sequence_numbers.seq % 50000) / 1000.0)
      WHEN 7 THEN 1.18000 + ((sequence_numbers.seq % 9000) / 100000.0)
      WHEN 8 THEN 0.59000 + ((sequence_numbers.seq % 6500) / 100000.0)
      ELSE 0.83000 + ((sequence_numbers.seq % 5000) / 100000.0)
    END AS DECIMAL(18, 5)
  ) AS open_price,
  CAST(
    CASE sequence_numbers.seq % 10
      WHEN 0 THEN 1.08000 + ((sequence_numbers.seq % 9000) / 100000.0) + (((sequence_numbers.seq % 41) - 20) / 100000.0)
      WHEN 1 THEN 1.22000 + ((sequence_numbers.seq % 8500) / 100000.0) + (((sequence_numbers.seq % 41) - 20) / 100000.0)
      WHEN 2 THEN 102.00000 + ((sequence_numbers.seq % 90000) / 1000.0) + (((sequence_numbers.seq % 41) - 20) / 1000.0)
      WHEN 3 THEN 1650.00000 + ((sequence_numbers.seq % 90000) / 100.0) + (((sequence_numbers.seq % 41) - 20) / 10.0)
      WHEN 4 THEN 0.62000 + ((sequence_numbers.seq % 6000) / 100000.0) + (((sequence_numbers.seq % 41) - 20) / 100000.0)
      WHEN 5 THEN 0.88000 + ((sequence_numbers.seq % 7500) / 100000.0) + (((sequence_numbers.seq % 41) - 20) / 100000.0)
      WHEN 6 THEN 118.00000 + ((sequence_numbers.seq % 50000) / 1000.0) + (((sequence_numbers.seq % 41) - 20) / 1000.0)
      WHEN 7 THEN 1.18000 + ((sequence_numbers.seq % 9000) / 100000.0) + (((sequence_numbers.seq % 41) - 20) / 100000.0)
      WHEN 8 THEN 0.59000 + ((sequence_numbers.seq % 6500) / 100000.0) + (((sequence_numbers.seq % 41) - 20) / 100000.0)
      ELSE 0.83000 + ((sequence_numbers.seq % 5000) / 100000.0) + (((sequence_numbers.seq % 41) - 20) / 100000.0)
    END AS DECIMAL(18, 5)
  ) AS close_price,
  CAST(0 AS DECIMAL(18, 5)) AS sl,
  CAST(0 AS DECIMAL(18, 5)) AS tp,
  CAST(((sequence_numbers.seq % 20001) - 10000) / 10.0 AS DECIMAL(18, 2)) AS profit,
  CONCAT('generated seed order_mt5 ', sequence_numbers.seq) AS comment
FROM (
  SELECT CAST(seq AS SIGNED) AS seq
  FROM seq_0_to_999999
) AS sequence_numbers;

