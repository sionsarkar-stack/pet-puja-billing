package com.petpuja.billing.menu;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
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
class MenuControllerTest {

        @Autowired
        private WebApplicationContext context;

        @Autowired
        private FilterChainProxy springSecurityFilterChain;

        @Autowired
        private MenuItemRepository menuItemRepository;

        private MockMvc mockMvc;

        @BeforeEach
        void setUp() {
                menuItemRepository.deleteAll();
                mockMvc = MockMvcBuilders.webAppContextSetup(context)
                                .addFilters(springSecurityFilterChain)
                                .build();
        }

        @Test
        void requiresTheOwnerSessionToReadTheMenu() throws Exception {
                mockMvc.perform(get("/api/menu"))
                                .andExpect(status().isUnauthorized());
        }

        @Test
        void createsUpdatesListsAndDeletesMenuItems() throws Exception {
                var ownerSession = signIn();

                mockMvc.perform(post("/api/menu")
                                .session(ownerSession)
                                .contentType(APPLICATION_JSON)
                                .content(
                                                """
                                                                {"name":"Masala Dosa","description":"Crisp dosa with potato filling","discountApplied":10,"price":180}
                                                                """))
                                .andExpect(status().isCreated())
                                .andExpect(jsonPath("$.name").value("Masala Dosa"))
                                .andExpect(jsonPath("$.discountApplied").value(10))
                                .andExpect(jsonPath("$.price").value(180));

                var storedMenuItem = menuItemRepository.findAll().get(0);
                assertThat(storedMenuItem.getDescription()).isEqualTo("Crisp dosa with potato filling");

                mockMvc.perform(put("/api/menu/{menuItemId}", storedMenuItem.getId())
                                .session(ownerSession)
                                .contentType(APPLICATION_JSON)
                                .content(
                                                """
                                                                {"name":"Masala Dosa","description":"With fresh potato filling","discountApplied":15,"price":195}
                                                                """))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.description").value("With fresh potato filling"))
                                .andExpect(jsonPath("$.discountApplied").value(15))
                                .andExpect(jsonPath("$.price").value(195));

                mockMvc.perform(get("/api/menu").session(ownerSession))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$[0].name").value("Masala Dosa"));

                mockMvc.perform(delete("/api/menu/{menuItemId}", storedMenuItem.getId()).session(ownerSession))
                                .andExpect(status().isNoContent());

                mockMvc.perform(get("/api/menu").session(ownerSession))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$").isEmpty());
        }

        @Test
        void rejectsDiscountsAboveOneHundredPercent() throws Exception {
                mockMvc.perform(post("/api/menu")
                                .session(signIn())
                                .contentType(APPLICATION_JSON)
                                .content("""
                                                {"name":"Masala Dosa","description":"Crisp dosa","discountApplied":100.01,"price":180}
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