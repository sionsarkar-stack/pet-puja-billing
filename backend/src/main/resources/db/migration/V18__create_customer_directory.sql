CREATE TABLE customer (
    phone_number VARCHAR(16) PRIMARY KEY,
    name VARCHAR(100),
    date_of_birth DATE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL
);

ALTER TABLE bill
    ADD COLUMN customer_phone VARCHAR(16);

ALTER TABLE bill
    ADD CONSTRAINT fk_bill_customer_phone
    FOREIGN KEY (customer_phone) REFERENCES customer (phone_number);

CREATE INDEX idx_customer_name ON customer (name);