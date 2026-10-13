package com.petpuja.billing.billing;

import java.time.Instant;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
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
import com.petpuja.billing.menu.MenuItemAddOn;
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
    private final BillDiscountService billDiscountService;

    public OpenOrderController(BillRepository billRepository, MenuItemRepository menuItemRepository,
            BillDiscountService billDiscountService) {
        this.billRepository = billRepository;
        this.menuItemRepository = menuItemRepository;
        this.billDiscountService = billDiscountService;
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

        var quantitiesByLine = new LinkedHashMap<OrderLineKey, Integer>();
        var menuItemsByLine = new LinkedHashMap<OrderLineKey, MenuItem>();
        var addOnsByLine = new LinkedHashMap<OrderLineKey, List<MenuItemAddOn>>();
        for (var line : request.lines()) {
            var menuItem = findMenuItem(line.menuItemId());
            var selectedAddOns = selectAddOns(menuItem, line.addOnIds());
            var addOnIds = new ArrayList<Long>();
            for (var addOn : selectedAddOns) {
                addOnIds.add(addOn.getId());
            }
            addOnIds.sort(Comparator.naturalOrder());
            var key = new OrderLineKey(menuItem.getId(), addOnIds);
            var existingQuantity = quantitiesByLine.get(key);
            var totalQuantity = existingQuantity == null ? line.quantity() : existingQuantity + line.quantity();
            quantitiesByLine.put(key, totalQuantity);
            menuItemsByLine.putIfAbsent(key, menuItem);
            addOnsByLine.putIfAbsent(key, selectedAddOns);
        }

        var bill = billRepository.findByOpenTableName(request.tableName())
                .orElseGet(() -> Bill.createOpen("PP-" + UUID.randomUUID(), request.tableName()));
        bill.clearLines();

        for (var entry : quantitiesByLine.entrySet()) {
            var key = entry.getKey();
            var menuItem = menuItemsByLine.get(key);
            var addOns = addOnsByLine.get(key);
            var addOnTotal = BigDecimal.ZERO;
            for (var addOn : addOns) {
                addOnTotal = addOnTotal.add(addOn.getPrice());
            }
            bill.addLine(menuItem, entry.getValue(), OrderPricing.calculateDiscountedPrice(menuItem).add(addOnTotal),
                    addOns);
        }
        var discountableSubtotal = bill.getDiscountableSubtotal();
        var discount = billDiscountService.calculateDiscount(discountableSubtotal);
        bill.applyDiscountPercent(discount.percent(), discountableSubtotal);

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
                bill.getSubtotal(),
                bill.getDiscountPercent(),
                bill.getDiscountAmount(),
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
                line.getLineTotal(),
                line.getAddOns().stream()
                        .map(addOn -> new OpenOrderResponse.OpenOrderAddOnResponse(
                                addOn.getMenuAddOnId(), addOn.getName(), addOn.getPrice()))
                        .toList());
    }

    private static List<MenuItemAddOn> selectAddOns(MenuItem menuItem, List<Long> addOnIds) {
        if (new HashSet<>(addOnIds).size() != addOnIds.size()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "An add-on was selected more than once");
        }

        var addOnsById = new HashMap<Long, MenuItemAddOn>();
        for (var addOn : menuItem.getAddOns()) {
            addOnsById.put(addOn.getId(), addOn);
        }
        var selectedAddOns = new ArrayList<MenuItemAddOn>();
        for (var addOnId : addOnIds) {
            var addOn = addOnsById.get(addOnId);
            if (addOn == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Add-on does not belong to this menu item");
            }
            selectedAddOns.add(addOn);
        }
        return List.copyOf(selectedAddOns);
    }

    private record OrderLineKey(long menuItemId, List<Long> addOnIds) {
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
            @Min(1) @Max(10_000) int quantity,
            @NotNull @Size(max = 20) List<@NotNull @Positive Long> addOnIds) {
        public OpenOrderLineRequest {
            addOnIds = addOnIds == null ? List.of() : List.copyOf(addOnIds);
        }
    }
}