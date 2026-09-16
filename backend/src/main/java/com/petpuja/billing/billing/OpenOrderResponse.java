package com.petpuja.billing.billing;

import java.math.BigDecimal;
import java.util.List;

public record OpenOrderResponse(
        String tableName,
        BigDecimal total,
        boolean completed,
        List<OpenOrderLineResponse> lines) {

    public record OpenOrderLineResponse(
            long menuItemId,
            String itemName,
            int quantity,
            BigDecimal unitPrice,
            BigDecimal lineTotal) {
    }
}