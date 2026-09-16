package com.petpuja.billing.billing;

import java.time.Instant;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface BillRefundRepository extends JpaRepository<BillRefund, Long> {

    boolean existsByBill_Id(Long billId);

    List<BillRefund> findAllByRefundedAtGreaterThanEqualAndRefundedAtLessThan(Instant startOfDay,
            Instant startOfNextDay);

    List<BillRefund> findAllByOrderByRefundedAtDesc();
}