package com.petpuja.billing.billing;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "bill_discount_settings")
public class BillDiscountSettings {

    @Id
    private Integer id;

    @Column(nullable = false)
    private boolean enabled;

    protected BillDiscountSettings() {
    }

    private BillDiscountSettings(Integer id, boolean enabled) {
        this.id = id;
        this.enabled = enabled;
    }

    static BillDiscountSettings create(Integer id, boolean enabled) {
        return new BillDiscountSettings(id, enabled);
    }

    void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public boolean isEnabled() {
        return enabled;
    }
}