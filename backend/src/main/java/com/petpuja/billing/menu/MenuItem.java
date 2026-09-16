package com.petpuja.billing.menu;

import java.math.BigDecimal;
import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

@Entity
@Table(name = "menu_item")
public class MenuItem {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(nullable = false, length = 120)
	private String name;

	@Column(length = 500)
	private String description;

	@Column(name = "discount_applied", nullable = false, precision = 5, scale = 2)
	private BigDecimal discountApplied = BigDecimal.ZERO;

	@Column(nullable = false, precision = 12, scale = 2)
	private BigDecimal price;

	@Column(nullable = false)
	private boolean available = true;

	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;

	@Column(name = "updated_at", nullable = false)
	private Instant updatedAt;

	protected MenuItem() {
	}

	private MenuItem(String name, String description, BigDecimal discountApplied, BigDecimal price) {
		this.name = name;
		this.description = description;
		this.discountApplied = discountApplied;
		this.price = price;
	}

	public static MenuItem create(String name, String description, BigDecimal discountApplied, BigDecimal price) {
		return new MenuItem(name, description, discountApplied, price);
	}

	public void update(String name, String description, BigDecimal discountApplied, BigDecimal price) {
		this.name = name;
		this.description = description;
		this.discountApplied = discountApplied;
		this.price = price;
	}

	@PrePersist
	void initializeTimestamps() {
		var now = Instant.now();
		createdAt = now;
		updatedAt = now;
	}

	@PreUpdate
	void updateTimestamp() {
		updatedAt = Instant.now();
	}

	public Long getId() {
		return id;
	}

	public String getName() {
		return name;
	}

	public String getDescription() {
		return description;
	}

	public BigDecimal getDiscountApplied() {
		return discountApplied;
	}

	public BigDecimal getPrice() {
		return price;
	}
}
