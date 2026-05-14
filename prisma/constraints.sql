DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stock_total_nonnegative'
  ) THEN
    ALTER TABLE "Stock"
      ADD CONSTRAINT stock_total_nonnegative CHECK ("total" >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stock_reserved_nonnegative'
  ) THEN
    ALTER TABLE "Stock"
      ADD CONSTRAINT stock_reserved_nonnegative CHECK ("reserved" >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stock_reserved_lte_total'
  ) THEN
    ALTER TABLE "Stock"
      ADD CONSTRAINT stock_reserved_lte_total CHECK ("reserved" <= "total");
  END IF;
END $$;
