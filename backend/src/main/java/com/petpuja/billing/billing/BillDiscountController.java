package com.petpuja.billing.billing;

import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

@Validated
@RestController
@RequestMapping("/api/discount-settings")
public class BillDiscountController {

    private final BillDiscountService discountService;

    public BillDiscountController(BillDiscountService discountService) {
        this.discountService = discountService;
    }

    @GetMapping
    @Transactional(readOnly = true)
    public BillDiscountService.SettingsResponse getSettings() {
        return discountService.getSettings();
    }

    @PutMapping
    public ResponseEntity<BillDiscountService.SettingsResponse> updateSettings(
            @Valid @RequestBody SettingsRequest request) {
        var saved = discountService.updateSettings(new BillDiscountService.SettingsRequest(
                request.enabled(),
                request.tiers().stream()
                        .map(tier -> new BillDiscountService.TierRequest(
                                tier.fromAmount(), tier.toAmount(), tier.discountPercent()))
                        .toList()));
        return ResponseEntity.ok(saved);
    }

    public record SettingsRequest(
            boolean enabled,
            @NotNull @Size(max = 20) java.util.List<@Valid TierRequest> tiers) {
        public SettingsRequest {
            tiers = tiers == null ? java.util.List.of() : java.util.List.copyOf(tiers);
        }
    }

    public record TierRequest(
            @DecimalMin("0.00") @Digits(integer = 10, fraction = 2) java.math.BigDecimal fromAmount,
            @DecimalMin("0.00") @Digits(integer = 10, fraction = 2) java.math.BigDecimal toAmount,
            @NotNull @DecimalMin("0.00") @DecimalMax("100.00") @Digits(integer = 3, fraction = 2) java.math.BigDecimal discountPercent) {
    }
}