package com.petpuja.billing.billing;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import com.petpuja.billing.menu.MenuItem;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
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

	@Column(name = "table_number")
	private Integer tableNumber;

	@Column(name = "table_name", length = 30)
	private String tableName;

	@Column(name = "open_table_name", length = 30, unique = true)
	private String openTableName;

	@Enumerated(EnumType.STRING)
	@Column(name = "payment_method", length = 20)
	private PaymentMethod paymentMethod;

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
		return bill;
	}

	public void addLine(MenuItem menuItem, int quantity, BigDecimal unitPrice) {
		var lineTotal = unitPrice.multiply(BigDecimal.valueOf(quantity));
		lines.add(BillLine.create(this, menuItem, quantity, unitPrice, lineTotal));
		subtotal = subtotal.add(lineTotal);
		total = subtotal.add(tax);
	}

	public void clearLines() {
		lines.clear();
		subtotal = BigDecimal.ZERO;
		total = subtotal.add(tax);
	}

	public void markPaid(PaymentMethod paymentMethod, Instant paidAt) {
		this.openTableName = null;
		this.paidAt = paidAt;
		this.paymentMethod = paymentMethod;
		this.status = BillStatus.PAID;
	}

	public void markCompleted(Instant completedAt) {
		this.completedAt = completedAt;
	}

	public void reopen() {
		completedAt = null;
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

	public Instant getPaidAt() {
		return paidAt;
	}

	public Integer getTableNumber() {
		return tableNumber;
	}

	public String getTableName() {
		return tableName == null ? "Table " + tableNumber : tableName;
	}

	public boolean isCompleted() {
		return completedAt != null;
	}

	public BigDecimal getTotal() {
		return total;
	}

	public List<BillLine> getLines() {
		return lines;
	}

	public BillRefund getRefund() {
		return refund;
	}
}
