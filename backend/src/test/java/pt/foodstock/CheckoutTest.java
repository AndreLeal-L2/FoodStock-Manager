package pt.foodstock;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(properties="spring.datasource.url=jdbc:h2:mem:checkout_test;DB_CLOSE_DELAY=-1")
@AutoConfigureMockMvc
class CheckoutTest {
    @Autowired MockMvc http;
    @Autowired ObjectMapper json;
    @Autowired JdbcTemplate db;
    String rice;
    @BeforeEach void seed() throws Exception {
        for(String table:List.of("sync_receipts","movements","purchases","products","shopping_items"))db.update("DELETE FROM "+table);
        db.update("UPDATE shopping_list_state SET template_imported=FALSE WHERE id=1");
        http.perform(post("/api/shopping-list/import")).andExpect(status().isOk());
        db.update("UPDATE shopping_items SET checked=TRUE WHERE sort_order IN (0,7)");
        rice=UUID.randomUUID().toString();
        db.update("INSERT INTO products(id,name,unit,stock,minimum_stock) VALUES(?,'Arroz','kg',2.25,0)",rice);
    }
    Map<String,Object> line(int index,String product,String name) {
        var value=new LinkedHashMap<String,Object>();value.put("shoppingId","template-"+index);value.put("templateIndex",index);
        value.put("productId",product);value.put("purchaseId",UUID.randomUUID().toString());
        value.put("newProduct",name==null?null:Map.of("name",name,"unit","kg"));
        value.put("quantity",index==0?1.2:1);value.put("total",index==0?6:2);return value;
    }
    String body(List<Map<String,Object>> items) throws Exception {
        var instance=UUID.fromString(db.queryForObject("SELECT instance_id FROM sync_state WHERE id=1",String.class));
        return json.writeValueAsString(new SyncApi.Operation(UUID.randomUUID(),instance,"CHECKOUT",UUID.randomUUID().toString(),
            json.valueToTree(Map.of("store","Loja A","purchasedOn","2024-01-01","items",items))));
    }
    @Test void wholeCartUpdatesStockExpensesAndMarksOnlyOnce() throws Exception {
        String chicken=UUID.randomUUID().toString(),body=body(List.of(line(0,chicken,"Frango"),line(7,rice,null)));
        http.perform(post("/api/sync/operations").contentType("application/json").content(body)).andExpect(status().isOk());
        http.perform(post("/api/sync/operations").contentType("application/json").content(body)).andExpect(status().isOk()).andExpect(jsonPath("$.duplicate").value(true));
        assertEquals(2,db.queryForObject("SELECT COUNT(*) FROM purchases",Integer.class));
        assertEquals(2,db.queryForObject("SELECT COUNT(*) FROM products",Integer.class));
        assertEquals(3.25,db.queryForObject("SELECT stock FROM products WHERE id=?",Double.class,rice));
        assertEquals(1.2,db.queryForObject("SELECT stock FROM products WHERE id=?",Double.class,chicken));
        assertEquals(8,db.queryForObject("SELECT SUM(total) FROM purchases",Double.class));
        assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM shopping_items WHERE checked=TRUE",Integer.class));
        assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM sync_receipts",Integer.class));
    }
    @Test void aFailureInTheLastLineRollsBackTheEntireCart() throws Exception {
        String body=body(List.of(line(0,UUID.randomUUID().toString(),"Frango"),line(7,UUID.randomUUID().toString(),null)));
        http.perform(post("/api/sync/operations").contentType("application/json").content(body)).andExpect(status().isNotFound());
        assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM purchases",Integer.class));
        assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM products",Integer.class));
        assertEquals(2.25,db.queryForObject("SELECT stock FROM products",Double.class));
        assertEquals(2,db.queryForObject("SELECT COUNT(*) FROM shopping_items WHERE checked=TRUE",Integer.class));
        assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM sync_receipts",Integer.class));
    }
    @Test void anotherCheckoutCannotPurchaseTheSameSelectionAgain() throws Exception {
        http.perform(post("/api/sync/operations").contentType("application/json").content(body(List.of(line(7,rice,null))))).andExpect(status().isOk());
        http.perform(post("/api/sync/operations").contentType("application/json").content(body(List.of(line(7,rice,null))))).andExpect(status().isConflict());
        assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM purchases",Integer.class));
        assertEquals(3.25,db.queryForObject("SELECT stock FROM products WHERE id=?",Double.class,rice));
    }
    @Test void invalidPricesAndRepeatedLinesCannotHaveSideEffects() throws Exception {
        var invalid=line(7,rice,null);invalid.put("total",0);
        http.perform(post("/api/sync/operations").contentType("application/json").content(body(List.of(invalid)))).andExpect(status().isBadRequest());
        http.perform(post("/api/sync/operations").contentType("application/json").content(body(List.of(line(7,rice,null),line(7,rice,null))))).andExpect(status().isBadRequest());
        assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM purchases",Integer.class));
        assertEquals(2.25,db.queryForObject("SELECT stock FROM products",Double.class));
        assertEquals(2,db.queryForObject("SELECT COUNT(*) FROM shopping_items WHERE checked=TRUE",Integer.class));
    }
}
