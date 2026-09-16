package com.petpuja.billing.menu;

import java.math.BigDecimal;
import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

@Validated
@RestController
@RequestMapping("/api/menu")
public class MenuController {

    private final MenuItemRepository menuItemRepository;

    public MenuController(MenuItemRepository menuItemRepository) {
        this.menuItemRepository = menuItemRepository;
    }

    @GetMapping
    public List<MenuItemResponse> listMenuItems() {
        return menuItemRepository.findAllByOrderByNameAsc().stream()
                .map(MenuController::toResponse)
                .toList();
    }

    @PostMapping
    public ResponseEntity<MenuItemResponse> createMenuItem(@Valid @RequestBody MenuItemRequest request) {
        var menuItem = MenuItem.create(
                request.name().trim(),
                normalizeDescription(request.description()),
                request.discountApplied(),
                request.price());
        var savedMenuItem = menuItemRepository.save(menuItem);

        return ResponseEntity.status(HttpStatus.CREATED).body(toResponse(savedMenuItem));
    }

    @PutMapping("/{menuItemId}")
    public MenuItemResponse updateMenuItem(
            @PathVariable long menuItemId,
            @Valid @RequestBody MenuItemRequest request) {
        var menuItem = findMenuItem(menuItemId);
        menuItem.update(
                request.name().trim(),
                normalizeDescription(request.description()),
                request.discountApplied(),
                request.price());

        return toResponse(menuItemRepository.save(menuItem));
    }

    @DeleteMapping("/{menuItemId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteMenuItem(@PathVariable long menuItemId) {
        menuItemRepository.delete(findMenuItem(menuItemId));
    }

    private MenuItem findMenuItem(long menuItemId) {
        return menuItemRepository.findById(menuItemId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Menu item not found"));
    }

    private static String normalizeDescription(String description) {
        if (description == null) {
            return null;
        }

        var normalizedDescription = description.trim();
        return normalizedDescription.isEmpty() ? null : normalizedDescription;
    }

    private static MenuItemResponse toResponse(MenuItem menuItem) {
        return new MenuItemResponse(
                menuItem.getId(),
                menuItem.getName(),
                menuItem.getDescription(),
                menuItem.getDiscountApplied(),
                menuItem.getPrice());
    }

    public record MenuItemRequest(
            @NotBlank @Size(max = 120) String name,
            @Size(max = 500) String description,
            @NotNull @DecimalMin("0.00") @DecimalMax("100.00") @Digits(integer = 3, fraction = 2) BigDecimal discountApplied,
            @NotNull @DecimalMin("0.00") @Digits(integer = 10, fraction = 2) BigDecimal price) {
    }

    public record MenuItemResponse(
            Long id,
            String name,
            String description,
            BigDecimal discountApplied,
            BigDecimal price) {
    }
}