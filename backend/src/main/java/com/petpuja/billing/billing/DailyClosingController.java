package com.petpuja.billing.billing;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

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
    private static final List<String> INDIVIDUAL_TOTAL_SOURCES = List.of(
            "Rimo (Secondary QR)", "Rjoe", "Rishi (Primary QR)", "Dinda", "Cash");

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
        var savedIndividualTotals = java.util.stream.IntStream.range(0, preview.individualTotals().size())
                .mapToObj(index -> {
                    var total = preview.individualTotals().get(index);
                    return DailyClosingIndividualTotal.create(dailyClosing, total.source(), index, total.income(),
                            total.refunds(), total.expenses(), total.difference());
                })
                .toList();
        dailyClosing.replaceIndividualTotals(savedIndividualTotals);
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

        var expenseWindowStart = dailyClosingRepository
                .findTopByClosedAtLessThanEqualOrderByClosedAtDesc(startedAt)
                .map(DailyClosing::getClosedAt)
                .orElse(startedAt);
        var savedExpenses = expenseRepository.findAllByCreatedAtGreaterThanEqualAndCreatedAtLessThan(
                expenseWindowStart,
                endedAt);
        var expenses = BigDecimal.ZERO;
        for (var expense : savedExpenses) {
            expenses = expenses.add(expense.getAmount());
        }

        var individualTotals = calculateIndividualTotals(paidBills, savedRefunds, savedExpenses);

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
                endedAt,
                individualTotals);
    }

    private static List<IndividualSavedTotalResponse> calculateIndividualTotals(
            List<Bill> paidBills,
            List<BillRefund> refunds,
            List<Expense> expenses) {
        var totalsBySource = new LinkedHashMap<String, IndividualTotalAccumulator>();
        for (var source : INDIVIDUAL_TOTAL_SOURCES) {
            totalsBySource.put(source, new IndividualTotalAccumulator(source));
        }

        for (var bill : paidBills) {
            addIncome(totalsBySource, "Cash", bill.getCashAmount());
            addIncome(totalsBySource, getOnlineSource(bill), bill.getOnlineAmount());
        }

        for (var refund : refunds) {
            addRefund(totalsBySource, refund);
        }

        for (var expense : expenses) {
            var source = switch (expense.getAddedBy()) {
                case "Rimo" -> "Rimo (Secondary QR)";
                case "Rishi" -> "Rishi (Primary QR)";
                case "Rjoe", "Dinda", "Cash" -> expense.getAddedBy();
                default -> "Other / unassigned";
            };
            var total = totalsBySource.computeIfAbsent(source, IndividualTotalAccumulator::new);
            total.expenses = total.expenses.add(expense.getAmount());
        }

        return totalsBySource.values().stream()
                .filter(total -> total.isStandardSource() || total.hasAmounts())
                .map(IndividualTotalAccumulator::toResponse)
                .toList();
    }

    private static void addIncome(Map<String, IndividualTotalAccumulator> totalsBySource, String source,
            BigDecimal amount) {
        if (amount.signum() <= 0)
            return;
        var total = totalsBySource.computeIfAbsent(source, IndividualTotalAccumulator::new);
        total.income = total.income.add(amount);
    }

    private static void addRefund(Map<String, IndividualTotalAccumulator> totalsBySource, BillRefund refund) {
        var bill = refund.getBill();
        var cashAmount = bill.getCashAmount();
        var onlineAmount = bill.getOnlineAmount();
        var paidAmount = cashAmount.add(onlineAmount);
        if (paidAmount.signum() <= 0) {
            var source = getOnlineSource(bill);
            var total = totalsBySource.computeIfAbsent(source, IndividualTotalAccumulator::new);
            total.refunds = total.refunds.add(refund.getAmount());
            return;
        }

        var cashRefund = refund.getAmount().multiply(cashAmount)
                .divide(paidAmount, 2, RoundingMode.HALF_UP);
        if (cashRefund.compareTo(cashAmount) > 0)
            cashRefund = cashAmount;
        var onlineRefund = refund.getAmount().subtract(cashRefund);
        if (onlineRefund.compareTo(onlineAmount) > 0) {
            onlineRefund = onlineAmount;
            cashRefund = refund.getAmount().subtract(onlineRefund);
        }
        var cashTotals = totalsBySource.get("Cash");
        cashTotals.refunds = cashTotals.refunds.add(cashRefund);
        var onlineTotals = totalsBySource.computeIfAbsent(getOnlineSource(bill), IndividualTotalAccumulator::new);
        onlineTotals.refunds = onlineTotals.refunds.add(onlineRefund);
    }

    private static String getOnlineSource(Bill bill) {
        if (bill.getUpiQrProvider() == UpiQrProvider.PRIMARY)
            return "Rishi (Primary QR)";
        if (bill.getUpiQrProvider() == UpiQrProvider.SECONDARY)
            return "Rimo (Secondary QR)";
        return "QR not recorded";
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
                dailyClosing.getClosedAt(),
                dailyClosing.getIndividualTotals().stream()
                        .map(DailyClosingController::toIndividualTotalResponse)
                        .toList());
    }

    private static IndividualSavedTotalResponse toIndividualTotalResponse(DailyClosingIndividualTotal total) {
        return new IndividualSavedTotalResponse(total.getSource(), total.getIncome(), total.getRefunds(),
                total.getExpenses(), total.getDifference());
    }

    private static final class IndividualTotalAccumulator {
        private final String source;
        private BigDecimal income = BigDecimal.ZERO;
        private BigDecimal refunds = BigDecimal.ZERO;
        private BigDecimal expenses = BigDecimal.ZERO;

        private IndividualTotalAccumulator(String source) {
            this.source = source;
        }

        private boolean isStandardSource() {
            return INDIVIDUAL_TOTAL_SOURCES.contains(source);
        }

        private boolean hasAmounts() {
            return income.signum() != 0 || refunds.signum() != 0 || expenses.signum() != 0;
        }

        private IndividualSavedTotalResponse toResponse() {
            return new IndividualSavedTotalResponse(source, income, refunds, expenses,
                    income.subtract(refunds).subtract(expenses));
        }
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
            Instant closedAt,
            List<IndividualSavedTotalResponse> individualTotals) {
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
            Instant endedAt,
            List<IndividualSavedTotalResponse> individualTotals) {
    }

    public record IndividualSavedTotalResponse(
            String source,
            BigDecimal income,
            BigDecimal refunds,
            BigDecimal expenses,
            BigDecimal difference) {
    }
}