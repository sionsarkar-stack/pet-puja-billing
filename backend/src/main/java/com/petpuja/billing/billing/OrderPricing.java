package com.petpuja.billing.billing;

import java.math.BigDecimal;
import java.math.RoundingMode;

import com.petpuja.billing.menu.MenuItem;

final class OrderPricing {

    private OrderPricing() {
    }

    static BigDecimal calculateDiscountedPrice(MenuItem menuItem) {
        var discountMultiplier = BigDecimal.ONE.subtract(menuItem.getDiscountApplied().movePointLeft(2));
        return menuItem.getPrice().multiply(discountMultiplier).setScale(2, RoundingMode.HALF_UP);
    }
}