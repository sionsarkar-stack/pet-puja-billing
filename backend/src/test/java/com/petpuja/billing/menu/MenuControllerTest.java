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
import org.springframework.transaction.annotation.Transactional;
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

        @Test
        @Transactional
        void createsAndUpdatesItemSpecificAddOnsInTheirMenuSection() throws Exception {
                var ownerSession = signIn();

                mockMvc.perform(post("/api/menu")
                                .session(ownerSession)
                                .contentType(APPLICATION_JSON)
                                .content("""
                                                {"name":"Chicken Sandwich","description":"Grilled chicken sandwich","section":"Continental","subsection":"Sandwiches","discountApplied":0,"price":90,"addOns":[{"name":"Extra cheese","price":20},{"name":"Grilled chicken","price":35}]}
                                                """))
                                .andExpect(status().isCreated())
                                .andExpect(jsonPath("$.section").value("Continental"))
                                .andExpect(jsonPath("$.subsection").value("Sandwiches"))
                                .andExpect(jsonPath("$.addOns.length()").value(2))
                                .andExpect(jsonPath("$.addOns[0].name").value("Extra cheese"));

                var createdItem = menuItemRepository.findAll().get(0);
                var extraCheeseId = createdItem.getAddOns().get(0).getId();

                mockMvc.perform(put("/api/menu/{menuItemId}", createdItem.getId())
                                .session(ownerSession)
                                .contentType(APPLICATION_JSON)
                                .content("""
                                                {"name":"Chicken Sandwich","description":"Grilled chicken sandwich","section":"Continental","subsection":"Sandwiches","discountApplied":0,"price":95,"addOns":[{"id":%d,"name":"Extra cheese","price":25}]}
                                                """
                                                .formatted(extraCheeseId)))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.addOns.length()").value(1))
                                .andExpect(jsonPath("$.addOns[0].price").value(25))
                                .andExpect(jsonPath("$.section").value("Continental"))
                                .andExpect(jsonPath("$.subsection").value("Sandwiches"));

                mockMvc.perform(get("/api/menu").session(ownerSession))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$[0].name").value("Chicken Sandwich"))
                                .andExpect(jsonPath("$[0].addOns.length()").value(1));
        }

        @Test
        void createsEditsAndRemovesCombosWithoutChangingComponentPrices() throws Exception {
                var session = signIn();
                var component = menuItemRepository.save(MenuItem.create("Dosa", null,
                                java.math.BigDecimal.ZERO, new java.math.BigDecimal("120")));
                var otherComponent = menuItemRepository.save(MenuItem.create("Tea", null,
                                java.math.BigDecimal.ZERO, new java.math.BigDecimal("30")));
                var result = mockMvc.perform(post("/api/menu").session(session).contentType(APPLICATION_JSON)
                                .content("""
                                                {"name":"Lunch combo","section":"Combo","discountApplied":10,"price":130,
                                                "comboItemIds":[%d,%d],"addOns":[{"name":"Cheese","price":20}]}
                                                """
                                                .formatted(component.getId(), otherComponent.getId())))
                                .andExpect(status().isCreated())
                                .andExpect(jsonPath("$.comboItems.length()").value(2))
                                .andExpect(jsonPath("$.comboItems[0].name").value("Dosa"))
                                .andExpect(jsonPath("$.price").value(130))
                                .andExpect(jsonPath("$.discountApplied").value(10))
                                .andExpect(jsonPath("$.addOns[0].name").value("Cheese"))
                                .andReturn();
                var comboId = ((Number) com.jayway.jsonpath.JsonPath.read(
                                result.getResponse().getContentAsString(), "$.id")).longValue();

                mockMvc.perform(delete("/api/menu/{id}", component.getId()).session(session))
                                .andExpect(status().isConflict());
                mockMvc.perform(put("/api/menu/{id}", component.getId()).session(session).contentType(APPLICATION_JSON)
                                .content("""
                                                {"name":"Nested combo","section":"Combo","discountApplied":0,"price":100,"comboItemIds":[%d]}
                                                """
                                                .formatted(otherComponent.getId())))
                                .andExpect(status().isConflict());
                mockMvc.perform(put("/api/menu/{id}", comboId).session(session).contentType(APPLICATION_JSON)
                                .content("""
                                                {"name":"Lunch combo","section":"Combo","discountApplied":5,"price":110,"comboItemIds":[%d]}
                                                """
                                                .formatted(component.getId())))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.comboItems.length()").value(1))
                                .andExpect(jsonPath("$.price").value(110));
                mockMvc.perform(get("/api/menu").session(session))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$[?(@.section == 'Combo')].comboItems[0].name").value("Dosa"));
                assertThat(menuItemRepository.findById(component.getId()).orElseThrow().getPrice())
                                .isEqualByComparingTo("120");
                mockMvc.perform(delete("/api/menu/{id}", comboId).session(session)).andExpect(status().isNoContent());
                assertThat(menuItemRepository.existsById(component.getId())).isTrue();
        }

        @Test
        @Transactional
        void rejectsEmptyMissingDuplicateNestedAndSelfReferencingComboItems() throws Exception {
                var session = signIn();
                var component = menuItemRepository.save(MenuItem.create("Dosa", null,
                                java.math.BigDecimal.ZERO, new java.math.BigDecimal("120")));
                var combo = menuItemRepository.save(MenuItem.create("Existing combo", null, "Combo",
                                java.math.BigDecimal.ZERO, new java.math.BigDecimal("100")));
                for (var ids : java.util.List.of("[]", "[999999999]", "[null]", "[-1]",
                                "[%d,%d]".formatted(component.getId(), component.getId()),
                                "[%d]".formatted(combo.getId()))) {
                        mockMvc.perform(post("/api/menu").session(session).contentType(APPLICATION_JSON)
                                        .content("""
                                                        {"name":"Invalid combo","section":"Combo","discountApplied":0,"price":100,"comboItemIds":%s}
                                                        """
                                                        .formatted(ids)))
                                        .andExpect(status().isBadRequest());
                }
                mockMvc.perform(put("/api/menu/{id}", combo.getId()).session(session).contentType(APPLICATION_JSON)
                                .content("""
                                                {"name":"Self combo","section":"Combo","discountApplied":0,"price":100,"comboItemIds":[%d]}
                                                """
                                                .formatted(combo.getId())))
                                .andExpect(status().isBadRequest());
                mockMvc.perform(post("/api/menu").session(session).contentType(APPLICATION_JSON)
                                .content("""
                                                {"name":"Ordinary item","section":"Other","discountApplied":0,"price":100,"comboItemIds":[%d]}
                                                """
                                                .formatted(component.getId())))
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