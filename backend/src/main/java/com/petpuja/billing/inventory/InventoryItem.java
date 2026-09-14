package com.petpuja.billing.inventory;

import java.math.BigDecimal;
import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "inventory_item")
public class InventoryItem {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(nullable = false, length = 120)
	private String name;

	@Column(nullable = false, length = 30)
	private String unit;

	@Column(nullable = false, precision = 12, scale = 3)
	private BigDecimal quantity = BigDecimal.ZERO;

	@Column(name = "reorder_level", nullable = false, precision = 12, scale = 3)
	private BigDecimal reorderLevel = BigDecimal.ZERO;

	@Column(name = "created_at", nullable = false, insertable = false, updatable = false)
	private Instant createdAt;

	@Column(name = "updated_at", nullable = false, insertable = false)
	private Instant updatedAt;

	protected InventoryItem() {
	}
}

