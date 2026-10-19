package com.petpuja.billing.billing;

import java.math.BigDecimal;

import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/balance-sheet")
public class BalanceSheetController {

    private final BillRepository billRepository;
    private final BillRefundRepository billRefundRepository;
    private final ExpenseRepository expenseRepository;

    public BalanceSheetController(
            BillRepository billRepository,
            BillRefundRepository billRefundRepository,
            ExpenseRepository expenseRepository) {
        this.billRepository = billRepository;
        this.billRefundRepository = billRefundRepository;
        this.expenseRepository = expenseRepository;
    }

    @GetMapping
    @Transactional(readOnly = true)
    public BalanceSheetResponse getBalanceSheet() {
        var revenue = BigDecimal.ZERO;
        for (var bill : billRepository.findAllByStatus(BillStatus.PAID)) {
            revenue = revenue.add(bill.getTotal());
        }

        var refunds = BigDecimal.ZERO;
        for (var refund : billRefundRepository.findAll()) {
            refunds = refunds.add(refund.getAmount());
        }

        var expenses = BigDecimal.ZERO;
        for (var expense : expenseRepository.findAll()) {
            expenses = expenses.add(expense.getAmount());
        }

        var profits = revenue.subtract(refunds).subtract(expenses);
        return new BalanceSheetResponse(profits, refunds, expenses, revenue);
    }

    public record BalanceSheetResponse(BigDecimal profits, BigDecimal refunds, BigDecimal expenses,
            BigDecimal revenue) {
    }
}