CREATE TABLE menu_item (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    description VARCHAR(500),
    price NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
    available BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE inventory_item (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    unit VARCHAR(30) NOT NULL,
    quantity NUMERIC(12, 3) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    reorder_level NUMERIC(12, 3) NOT NULL DEFAULT 0 CHECK (reorder_level >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE bill (
    id BIGSERIAL PRIMARY KEY,
    bill_number VARCHAR(40) NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL CHECK (status IN ('OPEN', 'PAID', 'CANCELLED')),
    subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
    tax NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (tax >= 0),
    total NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (total >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE bill_line (
    id BIGSERIAL PRIMARY KEY,
    bill_id BIGINT NOT NULL REFERENCES bill(id) ON DELETE CASCADE,
    menu_item_id BIGINT REFERENCES menu_item(id) ON DELETE SET NULL,
    item_name VARCHAR(120) NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
    line_total NUMERIC(12, 2) NOT NULL CHECK (line_total >= 0)
);

CREATE INDEX idx_bill_created_at ON bill(created_at DESC);
CREATE INDEX idx_bill_line_bill_id ON bill_line(bill_id);
CREATE INDEX idx_inventory_item_name ON inventory_item(name);
CREATE INDEX idx_menu_item_name ON menu_item(name);

