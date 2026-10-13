package com.petpuja.billing.billing;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Comparator;
import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class BillDiscountService {

    private static final int SETTINGS_ID = 1;
    private static final BigDecimal ZERO = BigDecimal.ZERO;

    private final BillDiscountSettingsRepository settingsRepository;
    private final BillDiscountTierRepository tierRepository;

    public BillDiscountService(BillDiscountSettingsRepository settingsRepository,
            BillDiscountTierRepository tierRepository) {
        this.settingsRepository = settingsRepository;
        this.tierRepository = tierRepository;
    }

    @Transactional(readOnly = true)
    public SettingsResponse getSettings() {
        var settings = settingsRepository.findById(SETTINGS_ID).orElse(null);
        return new SettingsResponse(settings != null && settings.isEnabled(), tierRepository.findAll().stream()
                .map(BillDiscountService::toResponse)
                .sorted(Comparator.comparing(tier -> lowerBound(tier.fromAmount())))
                .toList());
    }

    @Transactional
    public SettingsResponse updateSettings(SettingsRequest request) {
        var tiers = validateAndSort(request.tiers());
        var settings = settingsRepository.findById(SETTINGS_ID)
                .orElseGet(() -> BillDiscountSettings.create(SETTINGS_ID, request.enabled()));
        settings.setEnabled(request.enabled());
        settingsRepository.save(settings);

        tierRepository.deleteAllInBatch();
        var savedTiers = tierRepository.saveAll(tiers.stream()
                .map(tier -> BillDiscountTier.create(tier.fromAmount(), tier.toAmount(), tier.discountPercent()))
                .toList());
        return new SettingsResponse(request.enabled(), savedTiers.stream()
                .map(BillDiscountService::toResponse)
                .sorted(Comparator.comparing(tier -> lowerBound(tier.fromAmount())))
                .toList());
    }

    @Transactional(readOnly = true)
    public DiscountResult calculateDiscount(BigDecimal subtotal) {
        var settings = settingsRepository.findById(SETTINGS_ID).orElse(null);
        if (settings == null || !settings.isEnabled())
            return DiscountResult.none();

        for (var tier : tierRepository.findAll()) {
            var fromAmount = lowerBound(tier.getFromAmount());
            if (subtotal.compareTo(fromAmount) >= 0
                    && (tier.getToAmount() == null || subtotal.compareTo(tier.getToAmount()) <= 0)) {
                var discountAmount = subtotal.multiply(tier.getDiscountPercent().movePointLeft(2))
                        .setScale(2, RoundingMode.HALF_UP);
                return new DiscountResult(tier.getDiscountPercent(), discountAmount);
            }
        }
        return DiscountResult.none();
    }

    private static List<TierRequest> validateAndSort(List<TierRequest> tiers) {
        var sortedTiers = tiers.stream()
                .sorted(Comparator.comparing(tier -> lowerBound(tier.fromAmount())))
                .toList();

        for (int index = 0; index < sortedTiers.size(); index++) {
            var tier = sortedTiers.get(index);
            if (tier.fromAmount() != null && tier.toAmount() != null
                    && tier.fromAmount().compareTo(tier.toAmount()) > 0) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Range start must not exceed range end");
            }
            if (index == 0)
                continue;

            var previous = sortedTiers.get(index - 1);
            if (previous.toAmount() == null
                    || lowerBound(tier.fromAmount()).compareTo(previous.toAmount()) <= 0) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Discount ranges cannot overlap");
            }
        }
        return sortedTiers;
    }

    private static BigDecimal lowerBound(BigDecimal fromAmount) {
        return fromAmount == null ? ZERO : fromAmount;
    }

    private static TierResponse toResponse(BillDiscountTier tier) {
        return new TierResponse(tier.getFromAmount(), tier.getToAmount(), tier.getDiscountPercent());
    }

    public record DiscountResult(BigDecimal percent, BigDecimal amount) {
        static DiscountResult none() {
            return new DiscountResult(ZERO, ZERO);
        }
    }

    public record SettingsResponse(boolean enabled, List<TierResponse> tiers) {
    }

    public record TierResponse(BigDecimal fromAmount, BigDecimal toAmount, BigDecimal discountPercent) {
    }

    public record SettingsRequest(boolean enabled, List<TierRequest> tiers) {
        public SettingsRequest {
            tiers = tiers == null ? List.of() : List.copyOf(tiers);
        }
    }

    public record TierRequest(
            BigDecimal fromAmount,
            BigDecimal toAmount,
            BigDecimal discountPercent) {
    }
}