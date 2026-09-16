package com.petpuja.billing.billing;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

public record PaidOrderResponse(
        Long id,
        String billNumber,
        String tableName,
        PaymentMethod paymentMethod,
        Instant paidAt,
        BigDecimal total,
        List<PaidOrderLineResponse> lines,
        BillRefundResponse refund) {

    public record PaidOrderLineResponse(
            String itemName,
            int quantity,
            BigDecimal unitPrice,
            BigDecimal lineTotal) {
    }
}