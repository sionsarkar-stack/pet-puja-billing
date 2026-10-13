package com.petpuja.billing.billing;

import java.math.BigDecimal;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "bill_discount_tier")
public class BillDiscountTier {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "from_amount", precision = 12, scale = 2)
    private BigDecimal fromAmount;

    @Column(name = "to_amount", precision = 12, scale = 2)
    private BigDecimal toAmount;

    @Column(name = "discount_percent", nullable = false, precision = 5, scale = 2)
    private BigDecimal discountPercent;

    protected BillDiscountTier() {
    }

    private BillDiscountTier(BigDecimal fromAmount, BigDecimal toAmount, BigDecimal discountPercent) {
        this.fromAmount = fromAmount;
        this.toAmount = toAmount;
        this.discountPercent = discountPercent;
    }

    static BillDiscountTier create(BigDecimal fromAmount, BigDecimal toAmount, BigDecimal discountPercent) {
        return new BillDiscountTier(fromAmount, toAmount, discountPercent);
    }

    public BigDecimal getFromAmount() {
        return fromAmount;
    }

    public BigDecimal getToAmount() {
        return toAmount;
    }

    public BigDecimal getDiscountPercent() {
        return discountPercent;
    }
}