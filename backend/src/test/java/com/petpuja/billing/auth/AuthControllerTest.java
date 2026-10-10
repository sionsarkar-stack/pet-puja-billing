package com.petpuja.billing.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.web.FilterChainProxy;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

@SpringBootTest
class AuthControllerTest {

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
    void keepsTheHealthEndpointPublic() throws Exception {
        mockMvc.perform(get("/api/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UP"));
    }

    @Test
    void keepsRestaurantConfigurationPublicForTheLoginScreen() throws Exception {
        mockMvc.perform(get("/api/public-config"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.restaurantName").exists())
                .andExpect(jsonPath("$.upiVpa").exists());
    }

    @Test
    void reportsSignedOutWhenNoSessionExists() throws Exception {
        mockMvc.perform(get("/api/auth/session"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.authenticated").value(false))
                .andExpect(jsonPath("$.username").doesNotExist())
                .andExpect(jsonPath("$.mode").doesNotExist());
    }

    @Test
    void signsInAsAdminAndRestoresTheModeInTheSession() throws Exception {
        MvcResult loginResult = mockMvc.perform(post("/api/auth/login")
                .contentType(APPLICATION_JSON)
                .content("{\"username\":\"test-admin\",\"password\":\"test-admin-password\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value("test-admin"))
                .andExpect(jsonPath("$.mode").value("ADMIN"))
                .andReturn();

        var session = (MockHttpSession) loginResult.getRequest().getSession(false);
        assertThat(session).isNotNull();

        mockMvc.perform(get("/api/auth/session").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.authenticated").value(true))
                .andExpect(jsonPath("$.username").value("test-admin"))
                .andExpect(jsonPath("$.mode").value("ADMIN"));

        mockMvc.perform(get("/api/expenses").session(session))
                .andExpect(status().isOk());
    }

    @Test
    void signsInAsCaptainAndRestrictsAdminOperations() throws Exception {
        MvcResult loginResult = mockMvc.perform(post("/api/auth/login")
                .contentType(APPLICATION_JSON)
                .content("{\"username\":\"test-captain\",\"password\":\"test-captain-password\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value("test-captain"))
                .andExpect(jsonPath("$.mode").value("CAPTAIN"))
                .andReturn();
        var session = (MockHttpSession) loginResult.getRequest().getSession(false);
        assertThat(session).isNotNull();

        mockMvc.perform(get("/api/auth/session").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.mode").value("CAPTAIN"));
        mockMvc.perform(get("/api/open-orders").session(session)).andExpect(status().isOk());
        mockMvc.perform(get("/api/menu").session(session)).andExpect(status().isOk());
        mockMvc.perform(get("/api/history").session(session)).andExpect(status().isOk());
        mockMvc.perform(post("/api/menu").session(session)
                .contentType(APPLICATION_JSON)
                .content("{\"name\":\"Test dish\",\"description\":null,\"discountApplied\":0,\"price\":100}"))
                .andExpect(status().isForbidden());
        mockMvc.perform(put("/api/menu/1").session(session)
                .contentType(APPLICATION_JSON)
                .content("{\"name\":\"Test dish\",\"description\":null,\"discountApplied\":0,\"price\":100}"))
                .andExpect(status().isForbidden());
        mockMvc.perform(delete("/api/menu/1").session(session)).andExpect(status().isForbidden());
        mockMvc.perform(get("/api/expenses").session(session)).andExpect(status().isForbidden());
        mockMvc.perform(get("/api/daily-closings").session(session)).andExpect(status().isForbidden());
        mockMvc.perform(get("/api/balance-sheet").session(session)).andExpect(status().isForbidden());
        mockMvc.perform(get("/api/backups/local-database").session(session)).andExpect(status().isForbidden());
    }

    @Test
    void rejectsAnIncorrectPassword() throws Exception {
        mockMvc.perform(post("/api/auth/login")
                .contentType(APPLICATION_JSON)
                .content("{\"username\":\"test-admin\",\"password\":\"incorrect\"}"))
                .andExpect(status().isUnauthorized());
    }
}