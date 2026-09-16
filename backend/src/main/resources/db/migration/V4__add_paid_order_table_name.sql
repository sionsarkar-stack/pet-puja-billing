ALTER TABLE bill
    ADD COLUMN table_name VARCHAR(30);

UPDATE bill
SET table_name = CONCAT('Table ', table_number)
WHERE table_name IS NULL
    AND table_number IS NOT NULL;