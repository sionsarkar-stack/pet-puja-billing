ALTER TABLE daily_closing
    ADD COLUMN refunds NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (refunds >= 0);