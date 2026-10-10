package com.petpuja.billing.billing;

import java.math.BigDecimal;
import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

@Entity
@Table(name = "bill_refund")
public class BillRefund {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "bill_id", nullable = false, unique = true)
    private Bill bill;

    @Enumerated(EnumType.STRING)
    @Column(name = "refund_type", nullable = false, length = 20)
    private RefundType refundType;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal amount;

    @Column(nullable = false, length = 500)
    private String reason;

    @Column(name = "refunded_by", length = 100)
    private String refundedBy;

    @Column(name = "refunded_at", nullable = false, updatable = false)
    private Instant refundedAt;

    protected BillRefund() {
    }

    private BillRefund(Bill bill, RefundType refundType, String reason, String refundedBy) {
        this.refundedBy = refundedBy;
        this.bill = bill;
        this.refundType = refundType;
        this.amount = bill.getTotal();
        this.reason = reason;
        bill.recordRefund(this);
    }

    public static BillRefund create(Bill bill, RefundType refundType, String reason, String refundedBy) {
        return new BillRefund(bill, refundType, reason, refundedBy);
    }

    @PrePersist
    void initializeRefundedAt() {
        refundedAt = Instant.now();
    }

    public Long getId() {
        return id;
    }

    public Bill getBill() {
        return bill;
    }

    public RefundType getRefundType() {
        return refundType;
    }

    public BigDecimal getAmount() {
        return amount;
    }

    public String getReason() {
        return reason;
    }

    public String getRefundedBy() {
        return refundedBy;
    }

    public Instant getRefundedAt() {
        return refundedAt;
    }
}