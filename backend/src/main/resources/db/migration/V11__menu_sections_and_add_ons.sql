ALTER TABLE menu_item
    ADD COLUMN section VARCHAR(60) NOT NULL DEFAULT 'Other';

CREATE TABLE menu_item_add_on (
    id BIGSERIAL PRIMARY KEY,
    menu_item_id BIGINT NOT NULL REFERENCES menu_item(id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL,
    price NUMERIC(12, 2) NOT NULL CHECK (price >= 0)
);

CREATE INDEX idx_menu_item_add_on_menu_item_id ON menu_item_add_on(menu_item_id);

CREATE TABLE bill_line_add_on (
    id BIGSERIAL PRIMARY KEY,
    bill_line_id BIGINT NOT NULL REFERENCES bill_line(id) ON DELETE CASCADE,
    menu_add_on_id BIGINT NOT NULL,
    name VARCHAR(120) NOT NULL,
    price NUMERIC(12, 2) NOT NULL CHECK (price >= 0)
);

CREATE INDEX idx_bill_line_add_on_bill_line_id ON bill_line_add_on(bill_line_id);

UPDATE menu_item
SET section = CASE
    WHEN name LIKE '%Maggi%' OR name LIKE 'Add-on - %' OR name LIKE 'Boiled Egg%'
        OR name LIKE 'Toast (%' OR name IN ('Egg Poach', 'Egg Omelette', 'Egg Cheese Omelette', 'Chicken Stew (with 3 slices)', 'Small English Platter') THEN 'Quick Bites'
    WHEN name IN ('Green Salad', 'Corn Salad', 'Egg-Chicken Salad', 'Gymboy Salad') THEN 'Salads'
    WHEN name LIKE '%Momo - %' THEN 'Momos'
    WHEN name LIKE '%Soup - %' THEN 'Soups'
    WHEN name LIKE 'Milk Tea%' OR name LIKE 'Black Tea%' OR name LIKE 'Green Tea%'
        OR name LIKE 'Lemon Masala Tea%' OR name LIKE 'Black Coffee%' OR name LIKE 'Milk Coffee%'
        OR name LIKE 'Cold Coffee%' OR name IN ('Green Mint', 'Mojito', 'Watermelon Juice', 'Ginger Lime', 'Blue Curacao') THEN 'Beverages'
    WHEN name LIKE 'French Fries%' OR name LIKE 'Fish & Chips%' OR name LIKE 'Chicken Pops%'
        OR name LIKE 'Chicken Nuggets%' OR name LIKE 'Chicken Fingers%' OR name LIKE 'Fish Fingers%' THEN 'Continental Starters'
    WHEN name LIKE '%Sandwich' THEN 'Sandwiches'
    WHEN name LIKE 'Classic Pizza' OR name LIKE 'Pizza Add-on - %' THEN 'Pizza'
    WHEN name LIKE '%Pasta - %' THEN 'Pasta'
    WHEN name LIKE '%Chowmein' OR name LIKE '%Fried Rice' OR name LIKE 'Chinese Add-on - %' THEN 'Chinese Noodles & Rice'
    WHEN name LIKE 'Crispy %' OR name LIKE 'Chilli Honey %' OR name LIKE 'Butter Garlic Pepper Dry %'
        THEN 'Chinese Starters'
    WHEN name IN ('Chilli Chicken', 'Chicken Manchurian', 'Schezwan Chicken', 'Butter Garlic Chicken')
        OR name LIKE '%Fish (6 pcs)' OR name LIKE '%Prawn (6 pcs)' OR name LIKE '%Paneer'
        THEN 'Chinese Main Course'
    ELSE 'Other'
END;

INSERT INTO menu_item_add_on (menu_item_id, name, price)
SELECT parent.id, legacy.name, legacy.price
FROM menu_item legacy
JOIN menu_item parent ON parent.name LIKE '%Maggi%'
WHERE legacy.name IN ('Add-on - Cheese', 'Add-on - Egg');

INSERT INTO menu_item_add_on (menu_item_id, name, price)
SELECT parent.id, REPLACE(legacy.name, 'Pizza Add-on - ', ''), legacy.price
FROM menu_item legacy
CROSS JOIN menu_item parent
WHERE legacy.name LIKE 'Pizza Add-on - %'
  AND parent.name = 'Classic Pizza';

INSERT INTO menu_item_add_on (menu_item_id, name, price)
SELECT parent.id, REPLACE(legacy.name, 'Chinese Add-on - ', ''), legacy.price
FROM menu_item legacy
CROSS JOIN menu_item parent
WHERE legacy.name LIKE 'Chinese Add-on - %'
  AND (parent.name LIKE '%Chowmein' OR parent.name LIKE '%Fried Rice');

UPDATE menu_item
SET available = FALSE
WHERE name IN ('Add-on - Cheese', 'Add-on - Egg')
   OR name LIKE 'Pizza Add-on - %'
   OR name LIKE 'Chinese Add-on - %';