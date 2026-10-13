package com.petpuja.billing.menu;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
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

    private static final Map<String, List<String>> MENU_SECTIONS = Map.of(
            "Quick Bites", List.of(),
            "Salads", List.of(),
            "Momos", List.of(),
            "Soups", List.of(),
            "Beverages", List.of("Hot Beverages", "Cold Beverages"),
            "Continental", List.of("Starters", "Sandwiches", "Pizza", "Pasta"),
            "Chinese", List.of("Noodles & Rice", "Main Course", "Starters"),
            "Other", List.of());

    private final MenuItemRepository menuItemRepository;

    public MenuController(MenuItemRepository menuItemRepository) {
        this.menuItemRepository = menuItemRepository;
    }

    @GetMapping
    @Transactional(readOnly = true)
    public List<MenuItemResponse> listMenuItems() {
        return menuItemRepository.findAllByAvailableTrueOrderBySectionAscSubsectionAscNameAsc().stream()
                .map(MenuController::toResponse)
                .toList();
    }

    @PostMapping
    @Transactional
    public ResponseEntity<MenuItemResponse> createMenuItem(@Valid @RequestBody MenuItemRequest request) {
        var menuItem = MenuItem.create(
                request.name().trim(),
                normalizeDescription(request.description()),
                normalizeSection(request.section()),
                normalizeSubsection(request.section(), request.subsection()),
                request.discountApplied(),
                request.price());
        replaceAddOns(menuItem, request.addOns());
        var savedMenuItem = menuItemRepository.save(menuItem);

        return ResponseEntity.status(HttpStatus.CREATED).body(toResponse(savedMenuItem));
    }

    @PutMapping("/{menuItemId}")
    @Transactional
    public MenuItemResponse updateMenuItem(
            @PathVariable long menuItemId,
            @Valid @RequestBody MenuItemRequest request) {
        var menuItem = findMenuItem(menuItemId);
        menuItem.update(
                request.name().trim(),
                normalizeDescription(request.description()),
                normalizeSection(request.section()),
                normalizeSubsection(request.section(), request.subsection()),
                request.discountApplied(),
                request.price());
        replaceAddOns(menuItem, request.addOns());

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

    private static String normalizeSection(String section) {
        var normalizedSection = section == null || section.isBlank() ? "Other" : section.trim();
        if (!MENU_SECTIONS.containsKey(normalizedSection)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown menu section");
        }
        return normalizedSection;
    }

    private static String normalizeSubsection(String section, String subsection) {
        var normalizedSection = normalizeSection(section);
        var normalizedSubsection = subsection == null ? "" : subsection.trim();
        var allowedSubsections = MENU_SECTIONS.get(normalizedSection);
        if ((allowedSubsections.isEmpty() && !normalizedSubsection.isEmpty())
                || (!allowedSubsections.isEmpty() && !allowedSubsections.contains(normalizedSubsection))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose a valid subsection for this section");
        }
        return normalizedSubsection;
    }

    private static void replaceAddOns(MenuItem menuItem, List<MenuAddOnRequest> requestedAddOns) {
        var existingAddOns = menuItem.getAddOns().stream()
                .filter(addOn -> addOn.getId() != null)
                .collect(java.util.stream.Collectors.toMap(addOn -> addOn.getId(), addOn -> addOn));
        var retainedIds = new java.util.HashSet<Long>();

        for (var requestedAddOn : requestedAddOns) {
            if (requestedAddOn.id() == null) {
                menuItem.addAddOn(requestedAddOn.name().trim(), requestedAddOn.price());
                continue;
            }

            var existingAddOn = existingAddOns.get(requestedAddOn.id());
            if (existingAddOn == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Add-on does not belong to this menu item");
            }
            existingAddOn.update(requestedAddOn.name().trim(), requestedAddOn.price());
            retainedIds.add(existingAddOn.getId());
        }

        menuItem.getAddOns().removeIf(addOn -> addOn.getId() != null && !retainedIds.contains(addOn.getId()));
    }

    private static MenuItemResponse toResponse(MenuItem menuItem) {
        return new MenuItemResponse(
                menuItem.getId(),
                menuItem.getName(),
                menuItem.getDescription(),
                menuItem.getSection(),
                menuItem.getSubsection(),
                menuItem.getDiscountApplied(),
                menuItem.getPrice(),
                menuItem.getAddOns().stream()
                        .map(addOn -> new MenuAddOnResponse(addOn.getId(), addOn.getName(), addOn.getPrice()))
                        .toList());
    }

    public record MenuItemRequest(
            @NotBlank @Size(max = 120) String name,
            @Size(max = 500) String description,
            @Size(max = 60) String section,
            @Size(max = 60) String subsection,
            @NotNull @DecimalMin("0.00") @DecimalMax("100.00") @Digits(integer = 3, fraction = 2) BigDecimal discountApplied,
            @NotNull @DecimalMin("0.00") @Digits(integer = 10, fraction = 2) BigDecimal price,
            @NotNull @Size(max = 20) List<@Valid MenuAddOnRequest> addOns) {
        public MenuItemRequest {
            section = normalizeSection(section);
            subsection = subsection == null ? "" : subsection.trim();
            addOns = addOns == null ? List.of() : List.copyOf(addOns);
        }
    }

    public record MenuAddOnRequest(
            Long id,
            @NotBlank @Size(max = 120) String name,
            @NotNull @DecimalMin("0.00") @Digits(integer = 10, fraction = 2) BigDecimal price) {
    }

    public record MenuItemResponse(
            Long id,
            String name,
            String description,
            String section,
            String subsection,
            BigDecimal discountApplied,
            BigDecimal price,
            List<MenuAddOnResponse> addOns) {
    }

    public record MenuAddOnResponse(
            Long id,
            String name,
            BigDecimal price) {
    }
}