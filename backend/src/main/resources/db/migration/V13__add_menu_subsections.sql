ALTER TABLE menu_item
    ADD COLUMN subsection VARCHAR(60) NOT NULL DEFAULT '';

UPDATE menu_item
SET section = CASE section
        WHEN 'Continental Starters' THEN 'Continental'
        WHEN 'Sandwiches' THEN 'Continental'
        WHEN 'Pizza' THEN 'Continental'
        WHEN 'Pasta' THEN 'Continental'
        WHEN 'Chinese Noodles & Rice' THEN 'Chinese'
        WHEN 'Chinese Main Course' THEN 'Chinese'
        WHEN 'Chinese Starters' THEN 'Chinese'
        ELSE section
    END,
    subsection = CASE
        WHEN section = 'Continental Starters' THEN 'Starters'
        WHEN section = 'Sandwiches' THEN 'Sandwiches'
        WHEN section = 'Pizza' THEN 'Pizza'
        WHEN section = 'Pasta' THEN 'Pasta'
        WHEN section = 'Chinese Noodles & Rice' THEN 'Noodles & Rice'
        WHEN section = 'Chinese Main Course' THEN 'Main Course'
        WHEN section = 'Chinese Starters' THEN 'Starters'
        WHEN section = 'Beverages' AND (name LIKE 'Milk Tea%' OR name LIKE 'Black Tea%'
            OR name LIKE 'Green Tea%' OR name LIKE 'Lemon Masala Tea%'
            OR name LIKE 'Black Coffee%' OR name LIKE 'Milk Coffee%') THEN 'Hot Beverages'
        WHEN section = 'Beverages' THEN 'Cold Beverages'
        ELSE ''
    END;