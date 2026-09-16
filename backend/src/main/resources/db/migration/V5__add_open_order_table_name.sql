ALTER TABLE bill
    ADD COLUMN open_table_name VARCHAR(30);

ALTER TABLE bill
    ADD CONSTRAINT uq_bill_open_table_name UNIQUE (open_table_name);