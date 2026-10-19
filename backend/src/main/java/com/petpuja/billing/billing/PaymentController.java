package com.petpuja.billing.billing;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import com.petpuja.billing.menu.MenuItem;
import com.petpuja.billing.menu.MenuItemRepository;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

@Validated
@RestController
@RequestMapping("/api/payments")
public class PaymentController {

    private final BillRepository billRepository;
    private final MenuItemRepository menuItemRepository;
    private final BillDiscountService billDiscountService;
    private final CommitteeMemberService committeeMemberService;

    public PaymentController(BillRepository billRepository, MenuItemRepository menuItemRepository,
            BillDiscountService billDiscountService, CommitteeMemberService committeeMemberService) {
        this.billRepository = billRepository;
        this.menuItemRepository = menuItemRepository;
        this.billDiscountService = billDiscountService;
        this.committeeMemberService = committeeMemberService;
    }

    @PostMapping
    @Transactional
    public ResponseEntity<PaidOrderResponse> createPayment(@Valid @RequestBody PaymentRequest request) {
        var bill = billRepository.findByOpenTableName(request.tableName())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT, "Open order not found"));
        bill.setCommitteeDiscountPercent(committeeMemberService.resolveDiscount(
                bill.getTableName(), null, bill.getCommitteeDiscountPercent()));
        var openOrderLines = List.copyOf(bill.getLines());
        if (openOrderLines.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Open order has no items");
        }
        if (!bill.isCompleted()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Complete the order before payment");
        }

        bill.clearLines();
        for (var openOrderLine : openOrderLines) {
            var menuItemId = openOrderLine.getMenuItemId();
            if (menuItemId == null) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Open order has an unavailable menu item");
            }

            var menuItem = findMenuItem(menuItemId);
            var addOnTotal = BigDecimal.ZERO;
            var addOnSnapshots = new ArrayList<BillLineAddOn.Snapshot>();
            for (var addOn : openOrderLine.getAddOns()) {
                addOnTotal = addOnTotal.add(addOn.getPrice());
                addOnSnapshots.add(addOn.toSnapshot());
            }
            bill.addLineFromSnapshots(menuItem, openOrderLine.getQuantity(),
                    OrderPricing.calculateDiscountedPrice(menuItem).add(addOnTotal),
                    addOnSnapshots);
        }
        var discountableSubtotal = bill.getDiscountableSubtotal();
        var discount = billDiscountService.calculateDiscount(discountableSubtotal);
        bill.applyDiscountPercent(
                bill.getCommitteeDiscountPercent() == null ? discount.percent() : bill.getCommitteeDiscountPercent(),
                discountableSubtotal);

        var cashAmount = request.paymentMethod() == PaymentMethod.CASH ? bill.getTotal() : BigDecimal.ZERO;
        var onlineAmount = request.paymentMethod() == PaymentMethod.ONLINE ? bill.getTotal() : BigDecimal.ZERO;
        if (request.paymentMethod() == PaymentMethod.SPLIT) {
            cashAmount = request.cashAmount();
            onlineAmount = request.onlineAmount();
            if (cashAmount == null || onlineAmount == null || cashAmount.signum() <= 0 || onlineAmount.signum() <= 0) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Enter positive cash and online amounts for a split payment");
            }
        }
        if (cashAmount.add(onlineAmount).compareTo(bill.getTotal()) != 0
                || (request.cashAmount() != null && cashAmount.compareTo(request.cashAmount()) != 0)
                || (request.onlineAmount() != null && onlineAmount.compareTo(request.onlineAmount()) != 0)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Cash and online amounts must add up to the bill total");
        }
        bill.markPaid(request.paymentMethod(), Instant.now(), cashAmount, onlineAmount);

        var savedBill = billRepository.save(bill);
        return ResponseEntity.status(HttpStatus.CREATED).body(toResponse(savedBill));
    }

    static PaidOrderResponse toResponse(Bill bill) {
        return new PaidOrderResponse(
                bill.getId(),
                bill.getBillNumber(),
                bill.getTableName(),
                bill.getTableLabel(),
                bill.getOrderDescription(),
                bill.getCustomerName(),
                bill.getPaymentMethod(),
                bill.getPaidAt(),
                bill.getSubtotal(),
                bill.getDiscountPercent(),
                bill.getDiscountAmount(),
                bill.getTotal(),
                bill.getCashAmount(),
                bill.getOnlineAmount(),
                bill.getLines().stream()
                        .map(line -> new PaidOrderResponse.PaidOrderLineResponse(
                                line.getDisplayName(),
                                line.getSection(),
                                line.getQuantity(),
                                line.getUnitPrice(),
                                line.getLineTotal()))
                        .toList(),
                bill.getRefund() == null ? null : RefundController.toResponse(bill.getRefund()));
    }

    private MenuItem findMenuItem(long menuItemId) {
        return menuItemRepository.findById(menuItemId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Menu item not found"));
    }

    public record PaymentRequest(
            @NotBlank @Size(max = 30) @Pattern(regexp = "(?:(?:Table|Outdoor) [1-9][0-9]*|Committee .{1,20})") String tableName,
            @NotNull PaymentMethod paymentMethod,
            @DecimalMin("0.00") @Digits(integer = 10, fraction = 2) BigDecimal cashAmount,
            @DecimalMin("0.00") @Digits(integer = 10, fraction = 2) BigDecimal onlineAmount) {
    }
}