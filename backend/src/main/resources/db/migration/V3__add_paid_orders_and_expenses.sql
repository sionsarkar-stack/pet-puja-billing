ALTER TABLE bill
    ADD COLUMN table_number INTEGER CHECK (table_number BETWEEN 1 AND 7);

ALTER TABLE bill
    ADD COLUMN payment_method VARCHAR(20) CHECK (payment_method IN ('CASH', 'ONLINE'));

ALTER TABLE bill
    ADD COLUMN paid_at TIMESTAMPTZ;

CREATE INDEX idx_bill_paid_at ON bill(paid_at DESC);

CREATE TABLE expense (
    id BIGSERIAL PRIMARY KEY,
    title VARCHAR(120) NOT NULL,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    added_by VARCHAR(80) NOT NULL,
    description VARCHAR(500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_expense_created_at ON expense(created_at DESC);