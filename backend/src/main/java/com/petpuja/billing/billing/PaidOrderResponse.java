package com.petpuja.billing.billing;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

public record PaidOrderResponse(
                Long id,
                String billNumber,
                String tableName,
                String tableLabel,
                String orderDescription,
                String customerName,
                PaymentMethod paymentMethod,
                Instant paidAt,
                BigDecimal subtotal,
                BigDecimal discountPercent,
                BigDecimal discountAmount,
                BigDecimal total,
                BigDecimal cashAmount,
                BigDecimal onlineAmount,
                List<PaidOrderLineResponse> lines,
                BillRefundResponse refund) {

        public record PaidOrderLineResponse(
                        String itemName,
                        String section,
                        int quantity,
                        BigDecimal unitPrice,
                        BigDecimal lineTotal) {
        }
}