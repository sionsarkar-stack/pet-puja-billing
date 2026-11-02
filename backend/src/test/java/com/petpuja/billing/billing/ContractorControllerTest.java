package com.petpuja.billing.billing;

import static org.hamcrest.Matchers.hasItem;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.web.FilterChainProxy;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

import com.jayway.jsonpath.JsonPath;

@SpringBootTest
class ContractorControllerTest {

    @Autowired
    private WebApplicationContext context;

    @Autowired
    private FilterChainProxy springSecurityFilterChain;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.webAppContextSetup(context)
                .addFilters(springSecurityFilterChain)
                .build();
    }

    @Test
    void createsListsUpdatesAndDeletesContractors() throws Exception {
        var ownerSession = signIn();
        var name = "Contractor " + java.util.UUID.randomUUID();
        MvcResult createResult = mockMvc.perform(post("/api/contractors")
                .session(ownerSession)
                .contentType(APPLICATION_JSON)
                .content(
                        """
                                {"name":"%s","phoneNumber":"+1 (555) 010-9999","address":"North Road","contractType":"Plumbing","description":"Kitchen repairs"}
                                """
                                .formatted(name)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.name").value(name))
                .andExpect(jsonPath("$.phoneNumber").value("+1 (555) 010-9999"))
                .andExpect(jsonPath("$.address").value("North Road"))
                .andExpect(jsonPath("$.contractType").value("Plumbing"))
                .andExpect(jsonPath("$.description").value("Kitchen repairs"))
                .andReturn();
        Number contractorId = JsonPath.read(createResult.getResponse().getContentAsString(), "$.id");

        mockMvc.perform(get("/api/contractors").session(ownerSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].name", hasItem(name)));

        mockMvc.perform(put("/api/contractors/{contractorId}", contractorId.longValue())
                .session(ownerSession)
                .contentType(APPLICATION_JSON)
                .content(
                        """
                                {"name":"%s","phoneNumber":"+1 555 010 9998","address":"South Road","contractType":"Electrical","description":"Updated work"}
                                """
                                .formatted(name)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.phoneNumber").value("+1 555 010 9998"))
                .andExpect(jsonPath("$.address").value("South Road"))
                .andExpect(jsonPath("$.contractType").value("Electrical"))
                .andExpect(jsonPath("$.description").value("Updated work"));

        mockMvc.perform(delete("/api/contractors/{contractorId}", contractorId.longValue()).session(ownerSession))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/contractors").session(ownerSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].name").value(org.hamcrest.Matchers.not(hasItem(name))));
    }

    @Test
    void requiresContractorNameAndPhoneNumber() throws Exception {
        var ownerSession = signIn();

        mockMvc.perform(post("/api/contractors")
                .session(ownerSession)
                .contentType(APPLICATION_JSON)
                .content("""
                        {"name":"Contractor without phone","address":"North Road"}
                        """))
                .andExpect(status().isBadRequest());

        mockMvc.perform(post("/api/contractors")
                .session(ownerSession)
                .contentType(APPLICATION_JSON)
                .content("""
                        {"name":" ","phoneNumber":"1234567890"}
                        """))
                .andExpect(status().isBadRequest());
    }

    private MockHttpSession signIn() throws Exception {
        MvcResult loginResult = mockMvc.perform(post("/api/auth/login")
                .contentType(APPLICATION_JSON)
                .content("{\"username\":\"test-admin\",\"password\":\"test-admin-password\"}"))
                .andExpect(status().isOk())
                .andReturn();

        return (MockHttpSession) loginResult.getRequest().getSession(false);
    }
}