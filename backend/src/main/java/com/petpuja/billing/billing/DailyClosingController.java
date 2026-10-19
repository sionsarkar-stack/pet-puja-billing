package com.petpuja.billing.billing;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@Validated
@RestController
@RequestMapping("/api/daily-closings")
public class DailyClosingController {

    private static final int BUSINESS_DAY_STATE_ID = 1;

    private final BillRepository billRepository;
    private final BillRefundRepository billRefundRepository;
    private final DailyClosingRepository dailyClosingRepository;
    private final ExpenseRepository expenseRepository;
    private final BusinessDayStateRepository businessDayStateRepository;

    public DailyClosingController(
            BillRepository billRepository,
            BillRefundRepository billRefundRepository,
            DailyClosingRepository dailyClosingRepository,
            ExpenseRepository expenseRepository,
            BusinessDayStateRepository businessDayStateRepository) {
        this.billRepository = billRepository;
        this.billRefundRepository = billRefundRepository;
        this.dailyClosingRepository = dailyClosingRepository;
        this.expenseRepository = expenseRepository;
        this.businessDayStateRepository = businessDayStateRepository;
    }

    @GetMapping
    @Transactional(readOnly = true)
    public List<DailyClosingResponse> listDailyClosings() {
        return dailyClosingRepository.findAllByOrderByClosingDateDesc().stream()
                .map(DailyClosingController::toResponse)
                .toList();
    }

    @GetMapping("/status")
    @Transactional(readOnly = true)
    public BusinessDayStatus getBusinessDayStatus() {
        return businessDayStateRepository.findById(BUSINESS_DAY_STATE_ID)
                .map(DailyClosingController::toStatus)
                .orElseGet(() -> new BusinessDayStatus(false, null, null));
    }

    @PostMapping("/start")
    @Transactional
    public ResponseEntity<BusinessDayStatus> startBusinessDay() {
        var state = getStateForUpdate();
        if (state.getStartedAt() != null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "A business day is already in progress");
        }

        var startedAt = Instant.now();
        var closingDate = BusinessDay.dateOf(startedAt);
        if (dailyClosingRepository.existsByClosingDate(closingDate)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This start date has already been closed");
        }

        state.start(startedAt);
        businessDayStateRepository.save(state);
        return ResponseEntity.status(HttpStatus.CREATED).body(toStatus(state));
    }

    @GetMapping("/preview")
    @Transactional(readOnly = true)
    public DailyClosingPreviewResponse previewEndBusinessDay() {
        var state = getActiveState();
        return calculatePreview(state.getStartedAt(), Instant.now());
    }

    @PostMapping("/end")
    @Transactional
    public ResponseEntity<DailyClosingResponse> endBusinessDay() {
        var state = getStateForUpdate();
        var startedAt = state.getStartedAt();
        if (startedAt == null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "No business day is in progress");
        }

        var closingDate = BusinessDay.dateOf(startedAt);
        if (dailyClosingRepository.existsByClosingDate(closingDate)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This start date has already been closed");
        }

        var endedAt = Instant.now();
        var preview = calculatePreview(startedAt, endedAt);
        var dailyClosing = DailyClosing.create(
                closingDate,
                preview.cashSales(),
                preview.onlineSales(),
                preview.profits(),
                preview.refunds(),
                preview.expenses(),
                preview.paidOrderCount(),
                preview.expenseCount(),
                startedAt,
                endedAt);
        var savedDailyClosing = dailyClosingRepository.save(dailyClosing);
        state.end();
        businessDayStateRepository.save(state);
        return ResponseEntity.status(HttpStatus.CREATED).body(toResponse(savedDailyClosing));
    }

    private BusinessDayState getStateForUpdate() {
        return businessDayStateRepository.findByIdForUpdate(BUSINESS_DAY_STATE_ID)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                        "Business day state is not initialized"));
    }

    private BusinessDayState getActiveState() {
        var state = businessDayStateRepository.findById(BUSINESS_DAY_STATE_ID).orElse(null);
        if (state == null || state.getStartedAt() == null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "No business day is in progress");
        }
        return state;
    }

    private DailyClosingPreviewResponse calculatePreview(Instant startedAt, Instant endedAt) {
        var closingDate = BusinessDay.dateOf(startedAt);
        var paidBills = billRepository.findAllByStatusAndPaidAtGreaterThanEqualAndPaidAtLessThan(
                BillStatus.PAID,
                startedAt,
                endedAt);
        var cashSales = BigDecimal.ZERO;
        var onlineSales = BigDecimal.ZERO;
        for (var paidBill : paidBills) {
            cashSales = cashSales.add(paidBill.getCashAmount());
            onlineSales = onlineSales.add(paidBill.getOnlineAmount());
        }

        var savedRefunds = billRefundRepository.findAllByRefundedAtGreaterThanEqualAndRefundedAtLessThan(
                startedAt,
                endedAt);
        var refunds = BigDecimal.ZERO;
        for (var refund : savedRefunds) {
            refunds = refunds.add(refund.getAmount());
        }

        var savedExpenses = expenseRepository.findAllByCreatedAtGreaterThanEqualAndCreatedAtLessThan(
                startedAt,
                endedAt);
        var expenses = BigDecimal.ZERO;
        for (var expense : savedExpenses) {
            expenses = expenses.add(expense.getAmount());
        }

        var revenue = cashSales.add(onlineSales);
        var profits = revenue.subtract(refunds).subtract(expenses);
        return new DailyClosingPreviewResponse(
                closingDate,
                cashSales,
                onlineSales,
                profits,
                refunds,
                expenses,
                revenue,
                paidBills.size(),
                savedExpenses.size(),
                startedAt,
                endedAt);
    }

    private static BusinessDayStatus toStatus(BusinessDayState state) {
        var startedAt = state.getStartedAt();
        return new BusinessDayStatus(
                startedAt != null,
                startedAt,
                startedAt == null ? null : BusinessDay.dateOf(startedAt));
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
                dailyClosing.getStartedAt(),
                dailyClosing.getClosedAt());
    }

    public record BusinessDayStatus(boolean active, Instant startedAt, LocalDate businessDate) {
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
            Instant startedAt,
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
            int expenseCount,
            Instant startedAt,
            Instant endedAt) {
    }
}