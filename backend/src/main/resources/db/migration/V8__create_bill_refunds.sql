CREATE TABLE bill_refund (
    id BIGSERIAL PRIMARY KEY,
    bill_id BIGINT NOT NULL UNIQUE REFERENCES bill(id) ON DELETE RESTRICT,
    refund_type VARCHAR(20) NOT NULL CHECK (refund_type IN ('VOID', 'REFUND')),
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    reason VARCHAR(500) NOT NULL,
    refunded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_bill_refund_refunded_at ON bill_refund(refunded_at DESC);