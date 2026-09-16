CREATE TABLE daily_closing (
    id BIGSERIAL PRIMARY KEY,
    closing_date DATE NOT NULL UNIQUE,
    cash_sales NUMERIC(12, 2) NOT NULL CHECK (cash_sales >= 0),
    online_sales NUMERIC(12, 2) NOT NULL CHECK (online_sales >= 0),
    profits NUMERIC(12, 2) NOT NULL CHECK (profits >= 0),
    expenses NUMERIC(12, 2) NOT NULL CHECK (expenses >= 0),
    revenue NUMERIC(12, 2) NOT NULL,
    paid_order_count INTEGER NOT NULL CHECK (paid_order_count >= 0),
    expense_count INTEGER NOT NULL CHECK (expense_count >= 0),
    closed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_daily_closing_date ON daily_closing(closing_date DESC);