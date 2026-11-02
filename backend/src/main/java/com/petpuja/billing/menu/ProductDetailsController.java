package com.petpuja.billing.menu;

import java.util.HashSet;
import java.util.List;
import java.util.Locale;

import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

@Validated
@RestController
@RequestMapping("/api/menu/{menuItemId}/product-details")
public class ProductDetailsController {

    private final MenuItemRepository menuItemRepository;

    public ProductDetailsController(MenuItemRepository menuItemRepository) {
        this.menuItemRepository = menuItemRepository;
    }

    @GetMapping
    @Transactional(readOnly = true)
    public ProductDetailsResponse getProductDetails(@PathVariable long menuItemId) {
        var menuItem = findMenuItem(menuItemId);
        return toResponse(menuItem);
    }

    @PutMapping
    @ResponseStatus(HttpStatus.OK)
    @Transactional
    public ProductDetailsResponse replaceProductDetails(
            @PathVariable long menuItemId,
            @Valid @RequestBody ProductDetailsRequest request) {
        var menuItem = findMenuItem(menuItemId);
        var seenMaterials = new HashSet<String>();
        for (var rawMaterial : request.rawMaterials()) {
            var normalizedName = rawMaterial.rawMaterial().trim().toLowerCase(Locale.ROOT);
            if (!seenMaterials.add(normalizedName)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Raw materials must be unique");
            }
        }

        var rawMaterials = java.util.stream.IntStream.range(0, request.rawMaterials().size())
                .mapToObj(index -> {
                    var rawMaterial = request.rawMaterials().get(index);
                    return MenuItemRawMaterial.create(menuItem, rawMaterial.rawMaterial().trim(),
                            rawMaterial.quantity().trim(), index);
                })
                .toList();
        menuItem.replaceRawMaterials(rawMaterials);
        menuItemRepository.save(menuItem);
        return toResponse(menuItem);
    }

    private MenuItem findMenuItem(long menuItemId) {
        return menuItemRepository.findById(menuItemId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Menu item not found"));
    }

    private static ProductDetailsResponse toResponse(MenuItem menuItem) {
        return new ProductDetailsResponse(menuItem.getId(), menuItem.getRawMaterials().stream()
                .map(rawMaterial -> new RawMaterialResponse(rawMaterial.getRawMaterial(), rawMaterial.getQuantity()))
                .toList());
    }

    public record ProductDetailsRequest(
            @NotNull @Size(max = 100) List<@Valid RawMaterialRequest> rawMaterials) {
    }

    public record RawMaterialRequest(
            @NotBlank @Size(max = 120) String rawMaterial,
            @NotBlank @Size(max = 80) String quantity) {
    }

    public record ProductDetailsResponse(Long menuItemId, List<RawMaterialResponse> rawMaterials) {
    }

    public record RawMaterialResponse(String rawMaterial, String quantity) {
    }
}