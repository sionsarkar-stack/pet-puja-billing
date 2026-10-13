package com.petpuja.billing.billing;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

import com.petpuja.billing.menu.MenuItem;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;

@Entity
@Table(name = "bill_line")
public class BillLine {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "bill_id", nullable = false)
	private Bill bill;

	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "menu_item_id")
	private MenuItem menuItem;

	@Column(name = "item_name", nullable = false, length = 120)
	private String itemName;

	@Column(nullable = false)
	private int quantity;

	@Column(name = "unit_price", nullable = false, precision = 12, scale = 2)
	private BigDecimal unitPrice;

	@Column(name = "line_total", nullable = false, precision = 12, scale = 2)
	private BigDecimal lineTotal;

	@OneToMany(mappedBy = "billLine", cascade = CascadeType.ALL, orphanRemoval = true)
	private List<BillLineAddOn> addOns = new ArrayList<>();

	protected BillLine() {
	}

	private BillLine(Bill bill, MenuItem menuItem, int quantity, BigDecimal unitPrice, BigDecimal lineTotal,
			List<BillLineAddOn.Snapshot> addOns) {
		this.bill = bill;
		this.itemName = menuItem.getName();
		this.lineTotal = lineTotal;
		this.menuItem = menuItem;
		this.quantity = quantity;
		this.unitPrice = unitPrice;
		addOns.forEach(addOn -> this.addOns.add(BillLineAddOn.create(this, addOn)));
	}

	public static BillLine create(Bill bill, MenuItem menuItem, int quantity, BigDecimal unitPrice,
			BigDecimal lineTotal) {
		return create(bill, menuItem, quantity, unitPrice, lineTotal, List.of());
	}

	public static BillLine create(Bill bill, MenuItem menuItem, int quantity, BigDecimal unitPrice,
			BigDecimal lineTotal, List<BillLineAddOn.Snapshot> addOns) {
		return new BillLine(bill, menuItem, quantity, unitPrice, lineTotal, addOns);
	}

	public String getItemName() {
		return itemName;
	}

	public String getSection() {
		return menuItem == null ? "Other" : menuItem.getSection();
	}

	public boolean isOtherSection() {
		var section = getSection();
		return section == null || section.isBlank()
				|| section.trim().equalsIgnoreCase("Other")
				|| section.trim().equalsIgnoreCase("Others");
	}

	public String getDisplayName() {
		if (addOns.isEmpty())
			return itemName;
		return itemName + " + "
				+ addOns.stream().map(BillLineAddOn::getName).collect(java.util.stream.Collectors.joining(", "));
	}

	public Long getMenuItemId() {
		return menuItem == null ? null : menuItem.getId();
	}

	public int getQuantity() {
		return quantity;
	}

	public BigDecimal getUnitPrice() {
		return unitPrice;
	}

	public BigDecimal getLineTotal() {
		return lineTotal;
	}

	public List<BillLineAddOn> getAddOns() {
		return addOns;
	}
}
