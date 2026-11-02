package com.petpuja.billing.billing;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.CascadeType;
import jakarta.persistence.FetchType;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;

@Entity
@Table(name = "daily_closing")
public class DailyClosing {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "closing_date", nullable = false, unique = true)
    private LocalDate closingDate;

    @Column(name = "cash_sales", nullable = false, precision = 12, scale = 2)
    private BigDecimal cashSales;

    @Column(name = "online_sales", nullable = false, precision = 12, scale = 2)
    private BigDecimal onlineSales;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal profits;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal refunds;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal expenses;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal revenue;

    @Column(name = "paid_order_count", nullable = false)
    private int paidOrderCount;

    @Column(name = "expense_count", nullable = false)
    private int expenseCount;

    @Column(name = "closed_at", nullable = false, updatable = false)
    private Instant closedAt;

    @Column(name = "started_at")
    private Instant startedAt;

    @OneToMany(mappedBy = "dailyClosing", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @OrderBy("position ASC")
    private List<DailyClosingIndividualTotal> individualTotals = new ArrayList<>();

    protected DailyClosing() {
    }

    private DailyClosing(
            LocalDate closingDate,
            BigDecimal cashSales,
            BigDecimal onlineSales,
            BigDecimal profits,
            BigDecimal refunds,
            BigDecimal expenses,
            int paidOrderCount,
            int expenseCount,
            Instant startedAt,
            Instant closedAt) {
        this.closingDate = closingDate;
        this.cashSales = cashSales;
        this.onlineSales = onlineSales;
        this.profits = profits;
        this.refunds = refunds;
        this.expenses = expenses;
        this.revenue = cashSales.add(onlineSales);
        this.paidOrderCount = paidOrderCount;
        this.expenseCount = expenseCount;
        this.startedAt = startedAt;
        this.closedAt = closedAt;
    }

    public static DailyClosing create(
            LocalDate closingDate,
            BigDecimal cashSales,
            BigDecimal onlineSales,
            BigDecimal profits,
            BigDecimal refunds,
            BigDecimal expenses,
            int paidOrderCount,
            int expenseCount) {
        return create(closingDate, cashSales, onlineSales, profits, refunds, expenses, paidOrderCount, expenseCount,
                null, Instant.now());
    }

    public static DailyClosing create(
            LocalDate closingDate,
            BigDecimal cashSales,
            BigDecimal onlineSales,
            BigDecimal profits,
            BigDecimal refunds,
            BigDecimal expenses,
            int paidOrderCount,
            int expenseCount,
            Instant startedAt,
            Instant closedAt) {
        return new DailyClosing(closingDate, cashSales, onlineSales, profits, refunds, expenses, paidOrderCount,
                expenseCount, startedAt, closedAt);
    }

    public Long getId() {
        return id;
    }

    public LocalDate getClosingDate() {
        return closingDate;
    }

    public BigDecimal getCashSales() {
        return cashSales;
    }

    public BigDecimal getOnlineSales() {
        return onlineSales;
    }

    public BigDecimal getProfits() {
        return profits;
    }

    public BigDecimal getRefunds() {
        return refunds;
    }

    public BigDecimal getExpenses() {
        return expenses;
    }

    public BigDecimal getRevenue() {
        return revenue;
    }

    public int getPaidOrderCount() {
        return paidOrderCount;
    }

    public int getExpenseCount() {
        return expenseCount;
    }

    public Instant getClosedAt() {
        return closedAt;
    }

    public Instant getStartedAt() {
        return startedAt;
    }

    public List<DailyClosingIndividualTotal> getIndividualTotals() {
        return individualTotals;
    }

    public void replaceIndividualTotals(List<DailyClosingIndividualTotal> individualTotals) {
        this.individualTotals.clear();
        this.individualTotals.addAll(individualTotals);
    }

    public void addGapExpense(String source, BigDecimal amount) {
        expenses = expenses.add(amount);
        profits = profits.subtract(amount);
        expenseCount++;
        adjustIndividualExpense(source, amount);
    }

    public void updateGapExpense(String previousSource, BigDecimal previousAmount, String nextSource,
            BigDecimal nextAmount) {
        var amountDelta = nextAmount.subtract(previousAmount);
        expenses = expenses.add(amountDelta);
        profits = profits.subtract(amountDelta);
        adjustIndividualExpense(previousSource, previousAmount.negate());
        adjustIndividualExpense(nextSource, nextAmount);
    }

    private void adjustIndividualExpense(String source, BigDecimal amountDelta) {
        if (individualTotals.isEmpty() || amountDelta.signum() == 0)
            return;

        var total = individualTotals.stream()
                .filter(existing -> existing.getSource().equals(source))
                .findFirst()
                .orElse(null);
        if (total != null) {
            total.adjustExpense(amountDelta);
            return;
        }

        if (amountDelta.signum() < 0)
            return;
        var position = individualTotals.stream()
                .mapToInt(DailyClosingIndividualTotal::getPosition)
                .max()
                .orElse(-1) + 1;
        individualTotals.add(DailyClosingIndividualTotal.create(this, source, position, BigDecimal.ZERO,
                BigDecimal.ZERO, amountDelta, amountDelta.negate()));
    }

}