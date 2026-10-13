CREATE TABLE business_day_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    started_at TIMESTAMPTZ
);

INSERT INTO business_day_state (id, started_at) VALUES (1, NULL);

ALTER TABLE daily_closing ADD COLUMN started_at TIMESTAMPTZ;