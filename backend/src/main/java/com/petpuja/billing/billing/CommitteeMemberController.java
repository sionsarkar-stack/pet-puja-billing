package com.petpuja.billing.billing;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

@RestController
@RequestMapping("/api/committee-members")
public class CommitteeMemberController {
    private final CommitteeMemberService service;

    public CommitteeMemberController(CommitteeMemberService service) {
        this.service = service;
    }

    @GetMapping
    public List<CommitteeMemberService.MemberResponse> list() {
        return service.list();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public CommitteeMemberService.MemberResponse add(@Valid @RequestBody MemberRequest request) {
        return service.add(request.name());
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable long id) {
        service.delete(id);
    }

    public record MemberRequest(
            @NotBlank @Size(max = 20) @Pattern(regexp = "[\\p{L}\\p{N}][\\p{L}\\p{N} .'-]{0,19}") String name) {
        public MemberRequest {
            name = name == null ? null : name.strip().replaceAll("\\s+", " ");
        }
    }
}