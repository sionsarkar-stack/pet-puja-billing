CREATE TABLE menu_item_combo_item (
    menu_item_id BIGINT NOT NULL REFERENCES menu_item(id) ON DELETE CASCADE,
    component_menu_item_id BIGINT NOT NULL REFERENCES menu_item(id),
    PRIMARY KEY (menu_item_id, component_menu_item_id),
    CHECK (menu_item_id <> component_menu_item_id)
);

CREATE INDEX idx_menu_combo_component ON menu_item_combo_item(component_menu_item_id);