package com.petpuja.billing.billing;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

import jakarta.persistence.LockModeType;

public interface CommitteeMemberRepository extends JpaRepository<CommitteeMember, Long> {
    List<CommitteeMember> findAllByActiveTrueOrderByIdAsc();

    Optional<CommitteeMember> findByNormalizedName(String normalizedName);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select member from CommitteeMember member where member.name = :name and member.active = true")
    Optional<CommitteeMember> findActiveForUpdate(String name);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select member from CommitteeMember member where member.id = :id")
    Optional<CommitteeMember> findForUpdate(Long id);
}