package com.petpuja.billing.billing;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
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

    public ExpenseController(ExpenseRepository expenseRepository) {
        this.expenseRepository = expenseRepository;
    }

    @GetMapping
    public List<ExpenseResponse> listExpenses() {
        return expenseRepository.findAllByOrderByCreatedAtDesc().stream()
                .map(ExpenseController::toResponse)
                .toList();
    }

    @PostMapping
    public ResponseEntity<ExpenseResponse> createExpense(@Valid @RequestBody ExpenseRequest request) {
        var addedBy = request.addedBy().trim();
        if ("Others".equals(addedBy)) {
            if (request.keBhai() == null || request.keBhai().isBlank()) {
                throw new org.springframework.web.server.ResponseStatusException(
                        HttpStatus.BAD_REQUEST, "Enter a name for Others");
            }
            addedBy = "Others: " + request.keBhai().trim();
        }

        var savedExpense = expenseRepository.save(Expense.create(
                request.title().trim(),
                request.amount(),
                addedBy,
                normalizeDescription(request.description())));

        return ResponseEntity.status(HttpStatus.CREATED).body(toResponse(savedExpense));
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
            @NotBlank @Pattern(regexp = "Rimo|Rjoe|Rishi|Dinda|Others") String addedBy,
            @Size(max = 72) String keBhai,
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