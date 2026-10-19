package com.petpuja.billing.billing;

import java.util.Locale;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "committee_member")
public class CommitteeMember {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 20)
    private String name;

    @Column(name = "normalized_name", nullable = false, unique = true, length = 20)
    private String normalizedName;

    @Column(nullable = false)
    private boolean active = true;

    protected CommitteeMember() {
    }

    static CommitteeMember create(String name) {
        var member = new CommitteeMember();
        member.name = name;
        member.normalizedName = name.toLowerCase(Locale.ROOT);
        return member;
    }

    public Long getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public boolean isActive() {
        return active;
    }

    public boolean isProtectedMember() {
        return "dinda".equals(normalizedName);
    }

    void setActive(boolean active) {
        this.active = active;
    }
}