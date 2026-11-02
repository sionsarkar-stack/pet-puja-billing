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
import jakarta.persistence.UniqueConstraint;

@Entity
@Table(name = "daily_closing_individual_total", uniqueConstraints = @UniqueConstraint(name = "daily_closing_individual_total_source_unique", columnNames = {
        "daily_closing_id", "source" }))
public class DailyClosingIndividualTotal {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "daily_closing_id", nullable = false)
    private DailyClosing dailyClosing;

    @Column(nullable = false, length = 80)
    private String source;

    @Column(nullable = false)
    private int position;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal income;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal refunds;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal expenses;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal difference;

    protected DailyClosingIndividualTotal() {
    }

    private DailyClosingIndividualTotal(DailyClosing dailyClosing, String source, int position, BigDecimal income,
            BigDecimal refunds, BigDecimal expenses, BigDecimal difference) {
        this.dailyClosing = dailyClosing;
        this.source = source;
        this.position = position;
        this.income = income;
        this.refunds = refunds;
        this.expenses = expenses;
        this.difference = difference;
    }

    public static DailyClosingIndividualTotal create(DailyClosing dailyClosing, String source, int position,
            BigDecimal income, BigDecimal refunds, BigDecimal expenses, BigDecimal difference) {
        return new DailyClosingIndividualTotal(dailyClosing, source, position, income, refunds, expenses, difference);
    }

    public String getSource() {
        return source;
    }

    public int getPosition() {
        return position;
    }

    public BigDecimal getIncome() {
        return income;
    }

    public BigDecimal getRefunds() {
        return refunds;
    }

    public BigDecimal getExpenses() {
        return expenses;
    }

    public BigDecimal getDifference() {
        return difference;
    }

    void adjustExpense(BigDecimal amountDelta) {
        expenses = expenses.add(amountDelta);
        difference = difference.subtract(amountDelta);
    }
}