package com.petpuja.billing.billing;

import java.math.BigDecimal;

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
@Table(name = "bill_line_add_on")
public class BillLineAddOn {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "bill_line_id", nullable = false)
    private BillLine billLine;

    @Column(name = "menu_add_on_id", nullable = false)
    private Long menuAddOnId;

    @Column(nullable = false, length = 120)
    private String name;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal price;

    protected BillLineAddOn() {
    }

    private BillLineAddOn(BillLine billLine, Snapshot snapshot) {
        this.billLine = billLine;
        this.menuAddOnId = snapshot.id();
        this.name = snapshot.name();
        this.price = snapshot.price();
    }

    static BillLineAddOn create(BillLine billLine, Snapshot snapshot) {
        return new BillLineAddOn(billLine, snapshot);
    }

    public Long getMenuAddOnId() {
        return menuAddOnId;
    }

    public String getName() {
        return name;
    }

    public BigDecimal getPrice() {
        return price;
    }

    public Snapshot toSnapshot() {
        return new Snapshot(menuAddOnId, name, price);
    }

    public record Snapshot(Long id, String name, BigDecimal price) {
    }
}