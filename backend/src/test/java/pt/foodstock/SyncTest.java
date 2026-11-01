package pt.foodstock;

import com.fasterxml.jackson.databind.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(properties="spring.datasource.url=jdbc:h2:mem:sync_test;DB_CLOSE_DELAY=-1")
@AutoConfigureMockMvc
class SyncTest {
    @Autowired MockMvc http;
    @Autowired ObjectMapper json;
    @Autowired JdbcTemplate db;
    String instance;
    @BeforeEach void clean() {
        for(String table:List.of("sync_receipts","movements","purchases","products","shopping_items"))db.update("DELETE FROM "+table);
        db.update("UPDATE shopping_list_state SET template_imported=FALSE WHERE id=1");
        instance=db.queryForObject("SELECT instance_id FROM sync_state WHERE id=1",String.class);
    }
    String op(String id,String kind,String entity,String data) throws Exception {
        var value=new LinkedHashMap<String,Object>();value.put("operationId",id);value.put("instanceId",instance);
        value.put("kind",kind);value.put("entityId",entity);value.put("data",json.readTree(data));return json.writeValueAsString(value);
    }
    JsonNode send(String body) throws Exception {
        return json.readTree(http.perform(post("/api/sync/operations").contentType("application/json").content(body))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }
    String product() throws Exception {
        String id=UUID.randomUUID().toString();send(op(UUID.randomUUID().toString(),"PRODUCT_CREATE",id,
            "{\"name\":\"Arroz\",\"unit\":\"kg\",\"initialStock\":0,\"minimumStock\":1}"));return id;
    }
    String purchase(String product,String operationId) throws Exception {
        return op(operationId,"PURCHASE_CREATE",UUID.randomUUID().toString(),"""
            {"productId":"%s","quantity":2,"total":6.00,"store":"A","purchasedOn":"2024-01-01"}
            """.formatted(product));
    }
    @Test void durableReceiptsPreventDoublePurchaseAfterLostResponse() throws Exception {
        String product=product(),operationId=UUID.randomUUID().toString(),body=purchase(product,operationId);
        assertFalse(send(body).get("duplicate").asBoolean());assertTrue(send(body).get("duplicate").asBoolean());
        assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM purchases",Integer.class));
        assertEquals(2,db.queryForObject("SELECT stock FROM products WHERE id=?",Double.class,product));
        var snapshot=json.readTree(http.perform(post("/api/sync/snapshot").contentType("application/json")
            .content(json.writeValueAsString(Map.of("expectedInstanceId",instance,"pendingIds",List.of(operationId,UUID.randomUUID().toString())))))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertEquals(1,snapshot.get("acknowledged").size());assertEquals(operationId,snapshot.get("acknowledged").get(0).asText());
        assertEquals(1,snapshot.get("data").get("purchases").size());
    }
    @Test void rejectsReuseOfAnIdWithAnotherPayload() throws Exception {
        String product=product(),body=purchase(product,UUID.randomUUID().toString());send(body);
        var changed=json.readTree(body);((com.fasterxml.jackson.databind.node.ObjectNode)changed.get("data")).put("total",99);
        http.perform(post("/api/sync/operations").contentType("application/json").content(json.writeValueAsString(changed)))
            .andExpect(status().isConflict());
        assertEquals(6,db.queryForObject("SELECT total FROM purchases",Double.class));
    }
    @Test void rejectedConsumptionLeavesNoReceiptAndCanBeRetriedAfterReplenishment() throws Exception {
        String product=product(),body=op(UUID.randomUUID().toString(),"CONSUME",product,"{\"quantity\":2,\"reason\":\"Consumo\"}");
        http.perform(post("/api/sync/operations").contentType("application/json").content(body)).andExpect(status().isConflict());
        assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM sync_receipts",Integer.class));
        send(purchase(product,UUID.randomUUID().toString()));send(body);send(body);
        assertEquals(0,db.queryForObject("SELECT stock FROM products WHERE id=?",Double.class,product));
    }
    @Test void doesNotOverwriteShoppingNotesChangedOnAnotherClient() throws Exception {
        send(op(UUID.randomUUID().toString(),"SHOPPING_IMPORT",null,"{}"));
        String id=db.queryForObject("SELECT id FROM shopping_items WHERE name='Ovos'",String.class);
        db.update("UPDATE shopping_items SET notes='Alterado no Mac' WHERE id=?",id);
        String change=op(UUID.randomUUID().toString(),"SHOPPING_DETAILS","template-5","""
            {"quantityText":"24","notes":"Do telefone","expectedQuantityText":"12 ou 24","expectedNotes":"","templateIndex":5}
            """);
        http.perform(post("/api/sync/operations").contentType("application/json").content(change)).andExpect(status().isConflict());
        assertEquals("Alterado no Mac",db.queryForObject("SELECT notes FROM shopping_items WHERE id=?",String.class,id));
    }
    @Test void mapsOfflineTemplateIdsToExistingLegacyListWithoutDuplicatingIt() throws Exception {
        http.perform(post("/api/shopping-list/import")).andExpect(status().isOk());
        String legacy=UUID.randomUUID().toString();db.update("UPDATE shopping_items SET id=? WHERE sort_order=5",legacy);
        send(op(UUID.randomUUID().toString(),"SHOPPING_IMPORT",null,"{}"));
        send(op(UUID.randomUUID().toString(),"SHOPPING_CHECK","template-5","{\"checked\":true,\"templateIndex\":5}"));
        assertTrue(Boolean.TRUE.equals(db.queryForObject("SELECT checked FROM shopping_items WHERE id=?",Boolean.class,legacy)));
        assertEquals(39,db.queryForObject("SELECT COUNT(*) FROM shopping_items",Integer.class));
    }
    @Test void invalidDataAndAnotherDatabaseCannotBeAcknowledged() throws Exception {
        String body=op(UUID.randomUUID().toString(),"PRODUCT_CREATE",UUID.randomUUID().toString(),"{\"name\":\"A\",\"unit\":\"kg\",\"initialStock\":-1,\"minimumStock\":0}");
        http.perform(post("/api/sync/operations").contentType("application/json").content(body)).andExpect(status().isBadRequest());
        http.perform(post("/api/sync/snapshot").contentType("application/json")
            .content(json.writeValueAsString(Map.of("expectedInstanceId",UUID.randomUUID().toString(),"pendingIds",List.of()))))
            .andExpect(status().isConflict());
        assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM sync_receipts",Integer.class));
        assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM products",Integer.class));
    }
    @Test void twoConcurrentDeliveriesAreAppliedOnce() throws Exception {
        String body=purchase(product(),UUID.randomUUID().toString());
        try(var executor=Executors.newFixedThreadPool(2)) {
            var first=executor.submit(()->send(body));var second=executor.submit(()->send(body));
            boolean a=first.get(10,TimeUnit.SECONDS).get("duplicate").asBoolean(),b=second.get(10,TimeUnit.SECONDS).get("duplicate").asBoolean();
            assertNotEquals(a,b);
        }
        assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM purchases",Integer.class));
    }
}
