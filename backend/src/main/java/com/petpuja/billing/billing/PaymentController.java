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

    public PaymentController(BillRepository billRepository, MenuItemRepository menuItemRepository,
            BillDiscountService billDiscountService) {
        this.billRepository = billRepository;
        this.menuItemRepository = menuItemRepository;
        this.billDiscountService = billDiscountService;
    }

    @PostMapping
    @Transactional
    public ResponseEntity<PaidOrderResponse> createPayment(@Valid @RequestBody PaymentRequest request) {
        var bill = billRepository.findByOpenTableName(request.tableName())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT, "Open order not found"));
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
        bill.applyDiscountPercent(discount.percent(), discountableSubtotal);

        bill.markPaid(request.paymentMethod(), Instant.now());

        var savedBill = billRepository.save(bill);
        return ResponseEntity.status(HttpStatus.CREATED).body(toResponse(savedBill));
    }

    static PaidOrderResponse toResponse(Bill bill) {
        return new PaidOrderResponse(
                bill.getId(),
                bill.getBillNumber(),
                bill.getTableName(),
                bill.getPaymentMethod(),
                bill.getPaidAt(),
                bill.getSubtotal(),
                bill.getDiscountPercent(),
                bill.getDiscountAmount(),
                bill.getTotal(),
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
            @NotBlank @Size(max = 30) @Pattern(regexp = "(?:Table|Outdoor) [1-9][0-9]*") String tableName,
            @NotNull PaymentMethod paymentMethod) {
    }
}