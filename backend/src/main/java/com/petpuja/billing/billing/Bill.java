package com.petpuja.billing.billing;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import com.petpuja.billing.billing.BillLineAddOn.Snapshot;
import com.petpuja.billing.menu.MenuItem;
import com.petpuja.billing.menu.MenuItemAddOn;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OneToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

@Entity
@Table(name = "bill")
public class Bill {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(name = "bill_number", nullable = false, unique = true, length = 40)
	private String billNumber;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false, length = 20)
	private BillStatus status = BillStatus.OPEN;

	@Column(nullable = false, precision = 12, scale = 2)
	private BigDecimal subtotal = BigDecimal.ZERO;

	@Column(nullable = false, precision = 12, scale = 2)
	private BigDecimal tax = BigDecimal.ZERO;

	@Column(nullable = false, precision = 12, scale = 2)
	private BigDecimal total = BigDecimal.ZERO;

	@Column(name = "discount_percent", nullable = false, precision = 5, scale = 2)
	private BigDecimal discountPercent = BigDecimal.ZERO;

	@Column(name = "discount_amount", nullable = false, precision = 12, scale = 2)
	private BigDecimal discountAmount = BigDecimal.ZERO;

	@Column(name = "table_number")
	private Integer tableNumber;

	@Column(name = "table_name", length = 30)
	private String tableName;

	@Column(name = "table_label", length = 100)
	private String tableLabel;

	@Column(name = "order_description", length = 500)
	private String orderDescription;

	@Column(name = "committee_discount_percent", precision = 5, scale = 2)
	private BigDecimal committeeDiscountPercent;

	@Column(name = "customer_name", length = 100)
	private String customerName;

	@Column(name = "customer_date_of_birth")
	private LocalDate customerDateOfBirth;

	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "customer_phone")
	private Customer customer;

	@Column(name = "open_table_name", length = 30, unique = true)
	private String openTableName;

	@Enumerated(EnumType.STRING)
	@Column(name = "payment_method", length = 20)
	private PaymentMethod paymentMethod;

	@Column(name = "cash_amount", precision = 12, scale = 2)
	private BigDecimal cashAmount;

	@Column(name = "online_amount", precision = 12, scale = 2)
	private BigDecimal onlineAmount;

	@Column(name = "paid_at")
	private Instant paidAt;

	@Column(name = "completed_at")
	private Instant completedAt;

	@OneToMany(mappedBy = "bill", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
	private List<BillLine> lines = new ArrayList<>();

	@OneToOne(mappedBy = "bill", fetch = FetchType.LAZY)
	private BillRefund refund;

	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;

	@Column(name = "updated_at", nullable = false)
	private Instant updatedAt;

	protected Bill() {
	}

	private Bill(String billNumber, String tableName, PaymentMethod paymentMethod, Instant paidAt) {
		this.billNumber = billNumber;
		this.paymentMethod = paymentMethod;
		this.paidAt = paidAt;
		this.status = BillStatus.PAID;
		this.tableName = tableName;
	}

	public static Bill createPaid(String billNumber, String tableName, PaymentMethod paymentMethod, Instant paidAt) {
		return new Bill(billNumber, tableName, paymentMethod, paidAt);
	}

	public static Bill createOpen(String billNumber, String tableName) {
		var bill = new Bill();
		bill.billNumber = billNumber;
		bill.openTableName = tableName;
		bill.status = BillStatus.OPEN;
		bill.tableName = tableName;
		if (tableName.startsWith("Committee ")) {
			bill.committeeDiscountPercent = BigDecimal.ZERO;
		}
		return bill;
	}

	public void addLine(MenuItem menuItem, int quantity, BigDecimal unitPrice) {
		addLine(menuItem, quantity, unitPrice, List.of());
	}

	public void addLine(MenuItem menuItem, int quantity, BigDecimal unitPrice, List<MenuItemAddOn> addOns) {
		var snapshots = addOns.stream()
				.map(addOn -> new Snapshot(addOn.getId(), addOn.getName(), addOn.getPrice()))
				.toList();
		addLineFromSnapshots(menuItem, quantity, unitPrice, snapshots);
	}

	public void addLineFromSnapshots(MenuItem menuItem, int quantity, BigDecimal unitPrice, List<Snapshot> addOns) {
		var lineTotal = unitPrice.multiply(BigDecimal.valueOf(quantity));
		lines.add(BillLine.create(this, menuItem, quantity, unitPrice, lineTotal, addOns));
		subtotal = subtotal.add(lineTotal);
		recalculateTotal();
	}

	public BigDecimal getDiscountableSubtotal() {
		if (tableName != null && tableName.startsWith("Committee ")) {
			return subtotal;
		}
		var discountableSubtotal = BigDecimal.ZERO;
		for (var line : lines) {
			if (!line.isOtherSection()) {
				discountableSubtotal = discountableSubtotal.add(line.getLineTotal());
			}
		}
		return discountableSubtotal;
	}

	public void applyDiscountPercent(BigDecimal discountPercent, BigDecimal discountableSubtotal) {
		this.discountPercent = discountPercent;
		discountAmount = discountableSubtotal.multiply(discountPercent.movePointLeft(2))
				.setScale(2, RoundingMode.HALF_UP);
		recalculateTotal();
	}

	private void recalculateTotal() {
		total = subtotal.subtract(discountAmount).add(tax);
	}

	public void clearLines() {
		lines.clear();
		subtotal = BigDecimal.ZERO;
		discountPercent = BigDecimal.ZERO;
		discountAmount = BigDecimal.ZERO;
		recalculateTotal();
	}

	public void markPaid(PaymentMethod paymentMethod, Instant paidAt) {
		markPaid(paymentMethod, paidAt,
				paymentMethod == PaymentMethod.CASH ? total : BigDecimal.ZERO,
				paymentMethod == PaymentMethod.ONLINE ? total : BigDecimal.ZERO);
	}

	public void markPaid(PaymentMethod paymentMethod, Instant paidAt, BigDecimal cashAmount, BigDecimal onlineAmount) {
		this.openTableName = null;
		this.paidAt = paidAt;
		this.paymentMethod = paymentMethod;
		this.cashAmount = cashAmount;
		this.onlineAmount = onlineAmount;
		this.status = BillStatus.PAID;
	}

	public void markCompleted(Instant completedAt) {
		this.completedAt = completedAt;
	}

	public void reopen() {
		completedAt = null;
	}

	public void setCustomerName(String customerName) {
		this.customerName = customerName == null || customerName.isBlank() ? null : customerName.strip();
	}

	void recordRefund(BillRefund refund) {
		this.refund = refund;
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

	public String getBillNumber() {
		return billNumber;
	}

	public BillStatus getStatus() {
		return status;
	}

	public PaymentMethod getPaymentMethod() {
		return paymentMethod;
	}

	public BigDecimal getCashAmount() {
		return cashAmount == null ? paymentMethod == PaymentMethod.CASH ? total : BigDecimal.ZERO : cashAmount;
	}

	public BigDecimal getOnlineAmount() {
		return onlineAmount == null ? paymentMethod == PaymentMethod.ONLINE ? total : BigDecimal.ZERO : onlineAmount;
	}

	public Instant getPaidAt() {
		return paidAt;
	}

	public Integer getTableNumber() {
		return tableNumber;
	}

	public String getTableName() {
		return tableName == null ? "Table " + tableNumber : tableName;
	}

	public String getCustomerName() {
		return customerName;
	}

	public String getTableLabel() {
		return tableLabel;
	}

	public String getOrderDescription() {
		return orderDescription;
	}

	public BigDecimal getCommitteeDiscountPercent() {
		return committeeDiscountPercent;
	}

	public void setCommitteeDiscountPercent(BigDecimal committeeDiscountPercent) {
		this.committeeDiscountPercent = committeeDiscountPercent;
	}

	public void setTableLabel(String tableLabel) {
		this.tableLabel = tableLabel == null || tableLabel.isBlank() ? null : tableLabel.strip();
	}

	public void setOrderDescription(String orderDescription) {
		this.orderDescription = orderDescription == null || orderDescription.isBlank()
				? null
				: orderDescription.strip();
	}

	public LocalDate getCustomerDateOfBirth() {
		return customerDateOfBirth;
	}

	public void setCustomerDateOfBirth(LocalDate customerDateOfBirth) {
		this.customerDateOfBirth = customerDateOfBirth;
	}

	public Customer getCustomer() {
		return customer;
	}

	public void setCustomer(Customer customer) {
		this.customer = customer;
	}

	public boolean isCompleted() {
		return completedAt != null;
	}

	public BigDecimal getTotal() {
		return total;
	}

	public BigDecimal getSubtotal() {
		return subtotal;
	}

	public BigDecimal getDiscountPercent() {
		return discountPercent;
	}

	public BigDecimal getDiscountAmount() {
		return discountAmount;
	}

	public List<BillLine> getLines() {
		return lines;
	}

	public BillRefund getRefund() {
		return refund;
	}
}
