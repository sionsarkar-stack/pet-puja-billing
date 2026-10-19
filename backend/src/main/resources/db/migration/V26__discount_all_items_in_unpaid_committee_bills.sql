UPDATE bill
SET committee_discount_percent = CASE
    WHEN table_name = 'Committee Dinda' THEN 20.00
    ELSE COALESCE(committee_discount_percent, discount_percent, 0.00)
END
WHERE status = 'OPEN' AND table_name LIKE 'Committee %';

UPDATE bill
SET discount_percent = committee_discount_percent,
    discount_amount = ROUND(subtotal * committee_discount_percent / 100, 2),
    total = subtotal - ROUND(subtotal * committee_discount_percent / 100, 2) + tax
WHERE status = 'OPEN' AND table_name LIKE 'Committee %';