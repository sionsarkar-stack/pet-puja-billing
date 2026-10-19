package com.petpuja.billing.billing;

import java.math.BigDecimal;
import java.util.List;
import java.util.Locale;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import jakarta.annotation.PostConstruct;

@Service
public class CommitteeMemberService {
    private static final BigDecimal DINDA_DISCOUNT = new BigDecimal("20.00");
    private final CommitteeMemberRepository members;
    private final BillRepository bills;

    public CommitteeMemberService(CommitteeMemberRepository members, BillRepository bills) {
        this.members = members;
        this.bills = bills;
    }

    @PostConstruct
    void initializeDefaults() {
        if (members.count() == 0) {
            members.saveAll(List.of("Rimo", "Rjoe", "Rishi", "Dinda").stream().map(CommitteeMember::create).toList());
        }
    }

    @Transactional(readOnly = true)
    public List<MemberResponse> list() {
        return members.findAllByActiveTrueOrderByIdAsc().stream().map(CommitteeMemberService::toResponse).toList();
    }

    @Transactional
    public MemberResponse add(String name) {
        var member = members.findByNormalizedName(name.toLowerCase(Locale.ROOT)).orElse(null);
        if (member != null && member.isActive()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "A committee member with this name already exists");
        }
        if (member == null)
            member = CommitteeMember.create(name);
        member.setActive(true);
        try {
            return toResponse(members.saveAndFlush(member));
        } catch (org.springframework.dao.DataIntegrityViolationException exception) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "A committee member with this name already exists");
        }
    }

    @Transactional
    public void delete(long id) {
        var member = members.findForUpdate(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Committee member not found"));
        if (member.isProtectedMember()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Dinda cannot be deleted");
        }
        if (bills.findByOpenTableName("Committee " + member.getName()).isPresent()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Settle this member's unpaid order before deleting them");
        }
        member.setActive(false);
    }

    @Transactional
    public BigDecimal resolveDiscount(String tableName, BigDecimal requested, BigDecimal saved) {
        if (!tableName.startsWith("Committee ")) {
            if (requested != null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Committee discounts are only available for committee orders");
            }
            return null;
        }
        var member = members.findActiveForUpdate(tableName.substring("Committee ".length()))
                .orElseThrow(
                        () -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Select an active committee member"));
        if (member.isProtectedMember()) {
            if (requested != null && requested.compareTo(DINDA_DISCOUNT) != 0) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Dinda's discount is fixed at 20%");
            }
            return DINDA_DISCOUNT;
        }
        return requested != null ? requested : saved != null ? saved : BigDecimal.ZERO;
    }

    private static MemberResponse toResponse(CommitteeMember member) {
        return new MemberResponse(member.getId(), member.getName(), member.isProtectedMember(),
                member.isProtectedMember() ? DINDA_DISCOUNT : null);
    }

    public record MemberResponse(Long id, String name, boolean protectedMember, BigDecimal fixedDiscountPercent) {
    }
}