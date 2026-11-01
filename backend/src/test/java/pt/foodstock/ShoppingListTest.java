package pt.foodstock;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(properties="spring.datasource.url=jdbc:h2:mem:shopping_test;DB_CLOSE_DELAY=-1")
@AutoConfigureMockMvc
class ShoppingListTest {
    @Autowired MockMvc http;
    @Autowired ObjectMapper json;
    @Autowired JdbcTemplate db;
    @BeforeEach void clean() {
        db.update("DELETE FROM shopping_items");
        db.update("UPDATE shopping_list_state SET template_imported=FALSE WHERE id=1");
    }
    JsonNode getJson(String path) throws Exception {
        return json.readTree(http.perform(get(path)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }
    JsonNode importList() throws Exception {
        return json.readTree(http.perform(post("/api/shopping-list/import")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }
    JsonNode find(JsonNode items,String name) {
        for(var item:items)if(item.get("name").asText().equals(name))return item;
        throw new AssertionError("Item missing: "+name);
    }
    @Test void importsExactPlanAndPreservesOpenQuantitiesAndNotes() throws Exception {
        assertFalse(getJson("/api/shopping-list").get("templateImported").asBoolean());
        var reply=importList();var items=reply.get("items");
        assertTrue(reply.get("templateImported").asBoolean());assertEquals(39,items.size());
        var categories=new java.util.HashSet<String>();
        for(var item:items){categories.add(item.get("category").asText());assertFalse(item.get("checked").asBoolean());}
        assertEquals(9,categories.size());
        assertEquals("12 ou 24",find(items,"Ovos").get("quantityText").asText());
        assertEquals("6/10",find(items,"Bananas").get("quantityText").asText());
        assertEquals("3",find(items,"Arroz").get("quantityText").asText());
        assertEquals("3 kg",find(items,"Cuscuz").get("quantityText").asText());
        assertEquals("2 ou 3 sacos",find(items,"Feijão").get("quantityText").asText());
        assertEquals("",find(items,"Frango").get("quantityText").asText());
        assertEquals("Pode ser o que tiver congelado",find(items,"Cenoura").get("categoryNote").asText());
        assertEquals("Filetes de pescada ou outras opções",find(items,"Peixe").get("notes").asText());
    }
    @Test void reimportDoesNotDuplicateOrResetEditedItems() throws Exception {
        String id=find(importList().get("items"),"Ovos").get("id").asText();
        http.perform(post("/api/shopping-list/"+id+"/check").contentType("application/json").content("{\"checked\":true}"))
            .andExpect(status().isNoContent());
        http.perform(post("/api/shopping-list/"+id+"/details").contentType("application/json").content("""
            {"quantityText":"24","notes":"Confirmado no supermercado"}
            """)).andExpect(status().isNoContent());
        var items=importList().get("items");var eggs=find(items,"Ovos");
        assertEquals(39,items.size());assertEquals(id,eggs.get("id").asText());assertTrue(eggs.get("checked").asBoolean());
        assertEquals("24",eggs.get("quantityText").asText());
        assertEquals("Confirmado no supermercado",eggs.get("notes").asText());
        http.perform(post("/api/shopping-list/"+id+"/check").contentType("application/json").content("{\"checked\":false}"))
            .andExpect(status().isNoContent());
        assertFalse(find(getJson("/api/shopping-list").get("items"),"Ovos").get("checked").asBoolean());
    }
    @Test void planningDoesNotCreateStockOrExpensesAndIsIncludedInExport() throws Exception {
        String id=importList().get("items").get(0).get("id").asText();
        http.perform(post("/api/shopping-list/"+id+"/check").contentType("application/json").content("{\"checked\":true}"))
            .andExpect(status().isNoContent());
        assertEquals(0,getJson("/api/products").size());assertEquals(0,getJson("/api/purchases").size());
        assertEquals(0,getJson("/api/stats?year=2026").get("total").asDouble());
        var exported=getJson("/api/export");assertEquals(2,exported.get("schemaVersion").asInt());
        assertEquals(39,exported.get("shoppingList").get("items").size());
    }
    @Test void rejectsInvalidUpdatesWithoutChangingData() throws Exception {
        String id=importList().get("items").get(0).get("id").asText();
        http.perform(post("/api/shopping-list/"+id+"/check").contentType("application/json").content("{}"))
            .andExpect(status().isBadRequest());
        http.perform(post("/api/shopping-list/"+id+"/details").contentType("application/json")
            .content(json.writeValueAsString(java.util.Map.of("quantityText","x".repeat(121),"notes",""))))
            .andExpect(status().isBadRequest());
        http.perform(post("/api/shopping-list/missing/check").contentType("application/json").content("{\"checked\":true}"))
            .andExpect(status().isNotFound());
        assertFalse(getJson("/api/shopping-list").get("items").get(0).get("checked").asBoolean());
    }
}
