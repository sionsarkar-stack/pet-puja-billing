ALTER TABLE bill
    ADD COLUMN upi_qr_provider VARCHAR(20);

ALTER TABLE bill
    ADD CONSTRAINT bill_upi_qr_provider_check
        CHECK (upi_qr_provider IS NULL OR upi_qr_provider IN ('PRIMARY', 'SECONDARY'));