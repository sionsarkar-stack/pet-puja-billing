ALTER TABLE bill
    ADD COLUMN discount_percent NUMERIC(5, 2) NOT NULL DEFAULT 0
        CHECK (discount_percent >= 0 AND discount_percent <= 100);

ALTER TABLE bill
    ADD COLUMN discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0
        CHECK (discount_amount >= 0);

CREATE TABLE bill_discount_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    enabled BOOLEAN NOT NULL DEFAULT FALSE
);

INSERT INTO bill_discount_settings (id, enabled) VALUES (1, FALSE);

CREATE TABLE bill_discount_tier (
    id BIGSERIAL PRIMARY KEY,
    from_amount NUMERIC(12, 2) CHECK (from_amount >= 0),
    to_amount NUMERIC(12, 2) CHECK (to_amount >= 0),
    discount_percent NUMERIC(5, 2) NOT NULL CHECK (discount_percent >= 0 AND discount_percent <= 100),
    CHECK (from_amount IS NULL OR to_amount IS NULL OR from_amount <= to_amount)
);