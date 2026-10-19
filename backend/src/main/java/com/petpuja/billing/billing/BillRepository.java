package com.petpuja.billing.billing;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface BillRepository extends JpaRepository<Bill, Long> {

	Optional<Bill> findByBillNumber(String billNumber);

	@EntityGraph(attributePaths = { "lines", "refund" })
	List<Bill> findAllByStatusOrderByPaidAtDesc(BillStatus status);

	@EntityGraph(attributePaths = { "lines", "customer" })
	Optional<Bill> findByOpenTableName(String openTableName);

	@EntityGraph(attributePaths = { "lines", "customer" })
	List<Bill> findAllByStatusOrderByCreatedAtDesc(BillStatus status);

	List<Bill> findAllByStatusAndPaidAtGreaterThanEqualAndPaidAtLessThan(
			BillStatus status,
			Instant startOfDay,
			Instant startOfNextDay);

	List<Bill> findAllByStatus(BillStatus status);

	@Modifying(clearAutomatically = true)
	@Query("update Bill bill set bill.customer = :replacement where bill.customer.phoneNumber = :phoneNumber")
	int reassignCustomer(@Param("phoneNumber") String phoneNumber, @Param("replacement") Customer replacement);

	@Modifying(clearAutomatically = true)
	@Query("update Bill bill set bill.customer = null where bill.customer.phoneNumber = :phoneNumber")
	int detachCustomer(@Param("phoneNumber") String phoneNumber);
}
