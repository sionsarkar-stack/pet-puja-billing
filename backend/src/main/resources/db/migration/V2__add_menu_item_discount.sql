ALTER TABLE menu_item
    ADD COLUMN discount_applied NUMERIC(5, 2) NOT NULL DEFAULT 0
        CHECK (discount_applied >= 0 AND discount_applied <= 100);