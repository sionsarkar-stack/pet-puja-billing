package com.petpuja.billing.billing;

import java.math.BigDecimal;
import java.time.Instant;

public record BillRefundResponse(
        Long id,
        Long billId,
        RefundType refundType,
        BigDecimal amount,
        String reason,
        String refundedBy,
        Instant refundedAt) {
}