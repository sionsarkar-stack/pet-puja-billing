package com.petpuja.billing.billing;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BillRepository extends JpaRepository<Bill, Long> {

	Optional<Bill> findByBillNumber(String billNumber);

	@EntityGraph(attributePaths = { "lines", "refund" })
	List<Bill> findAllByStatusOrderByPaidAtDesc(BillStatus status);

	@EntityGraph(attributePaths = "lines")
	Optional<Bill> findByOpenTableName(String openTableName);

	@EntityGraph(attributePaths = "lines")
	List<Bill> findAllByStatusOrderByCreatedAtDesc(BillStatus status);

	List<Bill> findAllByStatusAndPaidAtGreaterThanEqualAndPaidAtLessThan(
			BillStatus status,
			Instant startOfDay,
			Instant startOfNextDay);

	List<Bill> findAllByStatus(BillStatus status);
}
