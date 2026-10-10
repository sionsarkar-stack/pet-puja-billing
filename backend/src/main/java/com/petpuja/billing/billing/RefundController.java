package com.petpuja.billing.billing;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

@Validated
@RestController
@RequestMapping("/api/refunds")
public class RefundController {

    private final BillRepository billRepository;
    private final BillRefundRepository billRefundRepository;

    public RefundController(BillRepository billRepository, BillRefundRepository billRefundRepository) {
        this.billRepository = billRepository;
        this.billRefundRepository = billRefundRepository;
    }

    @PostMapping
    @Transactional
    public ResponseEntity<BillRefundResponse> createRefund(@Valid @RequestBody RefundRequest request,
            java.security.Principal principal) {
        var bill = billRepository.findById(request.billId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Paid order not found"));
        if (bill.getStatus() != BillStatus.PAID) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Only paid orders can be corrected");
        }
        if (billRefundRepository.existsByBill_Id(bill.getId())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This order has already been corrected");
        }

        var refund = BillRefund.create(bill, request.refundType(), request.reason().trim(), principal.getName());
        var savedRefund = billRefundRepository.save(refund);
        return ResponseEntity.status(HttpStatus.CREATED).body(toResponse(savedRefund));
    }

    static BillRefundResponse toResponse(BillRefund refund) {
        return new BillRefundResponse(
                refund.getId(),
                refund.getBill().getId(),
                refund.getRefundType(),
                refund.getAmount(),
                refund.getReason(),
                refund.getRefundedBy(),
                refund.getRefundedAt());
    }

    public record RefundRequest(
            @NotNull Long billId,
            @NotNull RefundType refundType,
            @NotBlank @Size(max = 500) String reason) {
    }
}