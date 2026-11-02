package com.petpuja.billing.menu;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

@Entity
@Table(name = "menu_item_raw_material")
public class MenuItemRawMaterial {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "menu_item_id", nullable = false)
    private MenuItem menuItem;

    @Column(name = "raw_material", nullable = false, length = 120)
    private String rawMaterial;

    @Column(nullable = false, length = 80)
    private String quantity;

    @Column(nullable = false)
    private int position;

    protected MenuItemRawMaterial() {
    }

    private MenuItemRawMaterial(MenuItem menuItem, String rawMaterial, String quantity, int position) {
        this.menuItem = menuItem;
        this.rawMaterial = rawMaterial;
        this.quantity = quantity;
        this.position = position;
    }

    public static MenuItemRawMaterial create(MenuItem menuItem, String rawMaterial, String quantity, int position) {
        return new MenuItemRawMaterial(menuItem, rawMaterial, quantity, position);
    }

    public String getRawMaterial() {
        return rawMaterial;
    }

    public String getQuantity() {
        return quantity;
    }

    public int getPosition() {
        return position;
    }
}