package com.petpuja.billing.billing;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import com.petpuja.billing.menu.MenuItem;
import com.petpuja.billing.menu.MenuItemRepository;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

@Validated
@RestController
@RequestMapping("/api/open-orders")
public class OpenOrderController {

    private final BillRepository billRepository;
    private final MenuItemRepository menuItemRepository;

    public OpenOrderController(BillRepository billRepository, MenuItemRepository menuItemRepository) {
        this.billRepository = billRepository;
        this.menuItemRepository = menuItemRepository;
    }

    @GetMapping
    @Transactional(readOnly = true)
    public List<OpenOrderResponse> listOpenOrders() {
        return billRepository.findAllByStatusOrderByCreatedAtDesc(BillStatus.OPEN).stream()
                .map(OpenOrderController::toResponse)
                .toList();
    }

    @PutMapping
    @Transactional
    public ResponseEntity<OpenOrderResponse> saveOpenOrder(@Valid @RequestBody OpenOrderRequest request) {
        if (request.lines().isEmpty()) {
            billRepository.findByOpenTableName(request.tableName()).ifPresent(billRepository::delete);
            return ResponseEntity.noContent().build();
        }

        var quantitiesByMenuItemId = new LinkedHashMap<Long, Integer>();
        for (var line : request.lines()) {
            var existingQuantity = quantitiesByMenuItemId.get(line.menuItemId());
            var totalQuantity = existingQuantity == null ? line.quantity() : existingQuantity + line.quantity();
            quantitiesByMenuItemId.put(line.menuItemId(), totalQuantity);
        }

        var bill = billRepository.findByOpenTableName(request.tableName())
                .orElseGet(() -> Bill.createOpen("PP-" + UUID.randomUUID(), request.tableName()));
        bill.clearLines();

        for (var entry : quantitiesByMenuItemId.entrySet()) {
            var menuItem = findMenuItem(entry.getKey());
            bill.addLine(menuItem, entry.getValue(), OrderPricing.calculateDiscountedPrice(menuItem));
        }

        if (request.completed()) {
            bill.markCompleted(Instant.now());
        } else {
            bill.reopen();
        }

        return ResponseEntity.ok(toResponse(billRepository.save(bill)));
    }

    private static OpenOrderResponse toResponse(Bill bill) {
        return new OpenOrderResponse(
                bill.getTableName(),
                bill.getTotal(),
                bill.isCompleted(),
                bill.getLines().stream()
                        .map(OpenOrderController::toLineResponse)
                        .toList());
    }

    private static OpenOrderResponse.OpenOrderLineResponse toLineResponse(BillLine line) {
        var menuItemId = line.getMenuItemId();
        if (menuItemId == null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Open order has an unavailable menu item");
        }

        return new OpenOrderResponse.OpenOrderLineResponse(
                menuItemId,
                line.getItemName(),
                line.getQuantity(),
                line.getUnitPrice(),
                line.getLineTotal());
    }

    private MenuItem findMenuItem(long menuItemId) {
        return menuItemRepository.findById(menuItemId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Menu item not found"));
    }

    public record OpenOrderRequest(
            @NotBlank @Size(max = 30) @Pattern(regexp = "(?:Table|Outdoor) [1-9][0-9]*") String tableName,
            @NotNull @Size(max = 100) List<@Valid OpenOrderLineRequest> lines,
            boolean completed) {
    }

    public record OpenOrderLineRequest(
            @NotNull @Positive Long menuItemId,
            @Min(1) @Max(10_000) int quantity) {
    }
}