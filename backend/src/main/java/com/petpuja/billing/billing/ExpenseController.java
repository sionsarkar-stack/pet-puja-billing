package com.petpuja.billing.billing;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

@Validated
@RestController
@RequestMapping("/api/expenses")
public class ExpenseController {

        private final ExpenseRepository expenseRepository;
        private final DailyClosingRepository dailyClosingRepository;
        private final BusinessDayStateRepository businessDayStateRepository;

        public ExpenseController(ExpenseRepository expenseRepository, DailyClosingRepository dailyClosingRepository,
                        BusinessDayStateRepository businessDayStateRepository) {
                this.expenseRepository = expenseRepository;
                this.dailyClosingRepository = dailyClosingRepository;
                this.businessDayStateRepository = businessDayStateRepository;
        }

        @GetMapping
        public List<ExpenseResponse> listExpenses() {
                return expenseRepository.findAllByOrderByCreatedAtDesc().stream()
                                .map(ExpenseController::toResponse)
                                .toList();
        }

        @PostMapping
        @Transactional
        public ResponseEntity<ExpenseResponse> createExpense(@Valid @RequestBody ExpenseRequest request) {
                lockBusinessDayState();
                var addedBy = request.addedBy().trim();

                var savedExpense = expenseRepository.save(Expense.create(
                                request.title().trim(),
                                request.amount(),
                                addedBy,
                                normalizeDescription(request.description())));

                return ResponseEntity.status(HttpStatus.CREATED).body(toResponse(savedExpense));
        }

        @PutMapping("/{expenseId}")
        @Transactional
        public ExpenseResponse updateExpense(@PathVariable Long expenseId,
                        @Valid @RequestBody ExpenseUpdateRequest request) {
                lockBusinessDayState();
                var expense = expenseRepository.findById(expenseId)
                                .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(
                                                HttpStatus.NOT_FOUND, "Expense not found"));
                var previousAddedBy = expense.getAddedBy();
                var previousAmount = expense.getAmount();
                var assignedClosing = findDailyClosingForExpense(expense.getCreatedAt());
                var nextAddedBy = request.addedBy() == null ? previousAddedBy : request.addedBy().trim();
                expense.updateDetails(
                                request.title().trim(),
                                request.amount(),
                                nextAddedBy,
                                normalizeDescription(request.description()));
                if (assignedClosing != null) {
                        assignedClosing.updateGapExpense(
                                        getIndividualSource(previousAddedBy), previousAmount,
                                        getIndividualSource(nextAddedBy), request.amount());
                        dailyClosingRepository.save(assignedClosing);
                }
                return toResponse(expenseRepository.save(expense));
        }

        private BusinessDayState lockBusinessDayState() {
                return businessDayStateRepository.findByIdForUpdate(1)
                                .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(
                                                HttpStatus.INTERNAL_SERVER_ERROR,
                                                "Business day state is not initialized"));
        }

        private DailyClosing findDailyClosingForExpense(Instant createdAt) {
                var closings = dailyClosingRepository.findAllByOrderByClosedAtAsc();
                for (var index = 0; index < closings.size(); index++) {
                        var closing = closings.get(index);
                        var closedAt = closing.getClosedAt();
                        var startedAt = closing.getStartedAt();
                        if (startedAt != null && !createdAt.isBefore(startedAt) && createdAt.isBefore(closedAt)) {
                                return closing;
                        }

                        if (createdAt.isBefore(closedAt))
                                continue;

                        for (var nextIndex = index + 1; nextIndex < closings.size(); nextIndex++) {
                                var nextClosing = closings.get(nextIndex);
                                var candidateStart = nextClosing.getStartedAt();
                                if (candidateStart == null || !candidateStart.isAfter(closedAt))
                                        continue;
                                if (!createdAt.isBefore(closedAt) && createdAt.isBefore(candidateStart))
                                        return nextClosing;
                                break;
                        }
                }
                return null;
        }

        private static String getIndividualSource(String addedBy) {
                return switch (addedBy) {
                        case "Rimo" -> "Rimo (Secondary QR)";
                        case "Rishi" -> "Rishi (Primary QR)";
                        case "Rjoe", "Dinda", "Cash" -> addedBy;
                        default -> "Other / unassigned";
                };
        }

        private static String normalizeDescription(String description) {
                if (description == null) {
                        return null;
                }

                var normalizedDescription = description.trim();
                return normalizedDescription.isEmpty() ? null : normalizedDescription;
        }

        static ExpenseResponse toResponse(Expense expense) {
                return new ExpenseResponse(
                                expense.getId(),
                                expense.getTitle(),
                                expense.getAmount(),
                                expense.getAddedBy(),
                                expense.getDescription(),
                                expense.getCreatedAt());
        }

        public record ExpenseRequest(
                        @NotBlank @Size(max = 120) String title,
                        @NotNull @DecimalMin("0.01") @Digits(integer = 10, fraction = 2) BigDecimal amount,
                        @NotBlank @Pattern(regexp = "Rimo|Rjoe|Rishi|Dinda|Cash") String addedBy,
                        @Size(max = 500) String description) {
        }

        public record ExpenseUpdateRequest(
                        @NotBlank @Size(max = 120) String title,
                        @NotNull @DecimalMin("0.01") @Digits(integer = 10, fraction = 2) BigDecimal amount,
                        @Pattern(regexp = "Rimo|Rjoe|Rishi|Dinda|Cash") String addedBy,
                        @Size(max = 500) String description) {
        }

        public record ExpenseResponse(
                        Long id,
                        String title,
                        BigDecimal amount,
                        String addedBy,
                        String description,
                        Instant createdAt) {
        }
}