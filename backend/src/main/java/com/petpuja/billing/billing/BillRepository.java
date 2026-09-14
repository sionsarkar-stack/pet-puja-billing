package com.petpuja.billing.billing;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

public interface BillRepository extends JpaRepository<Bill, Long> {

	Optional<Bill> findByBillNumber(String billNumber);
}

