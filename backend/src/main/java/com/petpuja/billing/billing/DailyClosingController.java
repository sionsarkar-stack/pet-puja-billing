package com.petpuja.billing.billing;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import jakarta.validation.Valid;
import jakarta.validation.constraints.PastOrPresent;

@Validated
@RestController
@RequestMapping("/api/daily-closings")
public class DailyClosingController {

    private static final ZoneId BUSINESS_TIME_ZONE = ZoneId.systemDefault();

    private final BillRepository billRepository;
    private final BillRefundRepository billRefundRepository;
    private final DailyClosingRepository dailyClosingRepository;
    private final ExpenseRepository expenseRepository;

    public DailyClosingController(
            BillRepository billRepository,
            BillRefundRepository billRefundRepository,
            DailyClosingRepository dailyClosingRepository,
            ExpenseRepository expenseRepository) {
        this.billRepository = billRepository;
        this.billRefundRepository = billRefundRepository;
        this.dailyClosingRepository = dailyClosingRepository;
        this.expenseRepository = expenseRepository;
    }

    @GetMapping
    @Transactional(readOnly = true)
    public List<DailyClosingResponse> listDailyClosings() {
        return dailyClosingRepository.findAllByOrderByClosingDateDesc().stream()
                .map(DailyClosingController::toResponse)
                .toList();
    }

    @GetMapping("/preview")
    @Transactional(readOnly = true)
    public DailyClosingPreviewResponse previewDay(
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) @PastOrPresent @org.springframework.web.bind.annotation.RequestParam LocalDate closingDate) {
        return calculatePreview(closingDate);
    }

    @PostMapping
    @Transactional
    public ResponseEntity<DailyClosingResponse> closeDay(@Valid @RequestBody DailyClosingRequest request) {
        var closingDate = request.closingDate() == null
                ? LocalDate.now(BUSINESS_TIME_ZONE)
                : request.closingDate();
        if (dailyClosingRepository.existsByClosingDate(closingDate)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This date has already been closed");
        }

        var preview = calculatePreview(closingDate);
        var dailyClosing = DailyClosing.create(
                preview.closingDate(),
                preview.cashSales(),
                preview.onlineSales(),
                preview.profits(),
                preview.refunds(),
                preview.expenses(),
                preview.paidOrderCount(),
                preview.expenseCount());
        var savedDailyClosing = dailyClosingRepository.save(dailyClosing);
        return ResponseEntity.status(HttpStatus.CREATED).body(toResponse(savedDailyClosing));
    }

    private DailyClosingPreviewResponse calculatePreview(LocalDate closingDate) {
        var startOfDay = closingDate.atStartOfDay(BUSINESS_TIME_ZONE).toInstant();
        var startOfNextDay = closingDate.plusDays(1).atStartOfDay(BUSINESS_TIME_ZONE).toInstant();
        var paidBills = billRepository.findAllByStatusAndPaidAtGreaterThanEqualAndPaidAtLessThan(
                BillStatus.PAID,
                startOfDay,
                startOfNextDay);
        var cashSales = BigDecimal.ZERO;
        var onlineSales = BigDecimal.ZERO;
        for (var paidBill : paidBills) {
            if (paidBill.getPaymentMethod() == PaymentMethod.CASH) {
                cashSales = cashSales.add(paidBill.getTotal());
            } else {
                onlineSales = onlineSales.add(paidBill.getTotal());
            }
        }

        var savedRefunds = billRefundRepository.findAllByRefundedAtGreaterThanEqualAndRefundedAtLessThan(
                startOfDay,
                startOfNextDay);
        var refunds = BigDecimal.ZERO;
        for (var refund : savedRefunds) {
            refunds = refunds.add(refund.getAmount());
        }

        var savedExpenses = expenseRepository.findAllByCreatedAtGreaterThanEqualAndCreatedAtLessThan(
                startOfDay,
                startOfNextDay);
        var expenses = BigDecimal.ZERO;
        for (var expense : savedExpenses) {
            expenses = expenses.add(expense.getAmount());
        }

        var profits = cashSales.add(onlineSales);
        var revenue = profits.subtract(refunds).subtract(expenses);
        return new DailyClosingPreviewResponse(
                closingDate,
                cashSales,
                onlineSales,
                profits,
                refunds,
                expenses,
                revenue,
                paidBills.size(),
                savedExpenses.size());
    }

    private static DailyClosingResponse toResponse(DailyClosing dailyClosing) {
        return new DailyClosingResponse(
                dailyClosing.getId(),
                dailyClosing.getClosingDate(),
                dailyClosing.getCashSales(),
                dailyClosing.getOnlineSales(),
                dailyClosing.getProfits(),
                dailyClosing.getRefunds(),
                dailyClosing.getExpenses(),
                dailyClosing.getRevenue(),
                dailyClosing.getPaidOrderCount(),
                dailyClosing.getExpenseCount(),
                dailyClosing.getClosedAt());
    }

    public record DailyClosingRequest(@PastOrPresent LocalDate closingDate) {
    }

    public record DailyClosingResponse(
            Long id,
            LocalDate closingDate,
            BigDecimal cashSales,
            BigDecimal onlineSales,
            BigDecimal profits,
            BigDecimal refunds,
            BigDecimal expenses,
            BigDecimal revenue,
            int paidOrderCount,
            int expenseCount,
            Instant closedAt) {
    }

    public record DailyClosingPreviewResponse(
            LocalDate closingDate,
            BigDecimal cashSales,
            BigDecimal onlineSales,
            BigDecimal profits,
            BigDecimal refunds,
            BigDecimal expenses,
            BigDecimal revenue,
            int paidOrderCount,
            int expenseCount) {
    }
}