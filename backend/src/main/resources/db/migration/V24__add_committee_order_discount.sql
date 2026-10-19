ALTER TABLE bill ADD COLUMN committee_discount_percent NUMERIC(5,2)
    CHECK (committee_discount_percent >= 0 AND committee_discount_percent <= 100);