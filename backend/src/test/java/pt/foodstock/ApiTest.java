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

@SpringBootTest(properties="spring.datasource.url=jdbc:h2:mem:test;DB_CLOSE_DELAY=-1")
@AutoConfigureMockMvc
class ApiTest {
    @Autowired MockMvc http;
    @Autowired ObjectMapper json;
    @Autowired JdbcTemplate db;
    @BeforeEach void clean() { db.update("DELETE FROM movements");db.update("DELETE FROM purchases");db.update("DELETE FROM products"); }
    String product() throws Exception {
        return json.readTree(http.perform(post("/api/products").contentType("application/json")
            .content("""
            {"name":"Arroz","unit":"kg","initialStock":0,"minimumStock":1}
            """)).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asText();
    }
    void purchase(String id,String quantity,String total,String store,String date) throws Exception {
        http.perform(post("/api/purchases").contentType("application/json").content("""
            {"productId":"%s","quantity":%s,"total":%s,"store":"%s","purchasedOn":"%s"}
            """.formatted(id,quantity,total,store,date))).andExpect(status().isCreated());
    }
    JsonNode getJson(String route) throws Exception {
        return json.readTree(http.perform(get(route)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }
    @Test void purchaseConsumptionAndHistory() throws Exception {
        String id=product();purchase(id,"1.5","3.60","Loja A","2024-01-10");
        http.perform(post("/api/products/"+id+"/consume").contentType("application/json")
            .content("{\"quantity\":0.25,\"reason\":\"Consumo\"}")).andExpect(status().isNoContent());
        assertEquals(1.25,getJson("/api/products").get(0).get("stock").asDouble());
        assertEquals(3.60,getJson("/api/purchases").get(0).get("total").asDouble());
        assertEquals(2,getJson("/api/export").get("movements").size());
    }
    @Test void cannotOverdrawAndMissingProductIs404() throws Exception {
        String id=product();
        http.perform(post("/api/products/"+id+"/consume").contentType("application/json")
            .content("{\"quantity\":1,\"reason\":\"Consumo\"}")).andExpect(status().isConflict());
        assertEquals(0,getJson("/api/products").get(0).get("stock").asInt());
        assertEquals(0,getJson("/api/export").get("movements").size());
        http.perform(post("/api/purchases").contentType("application/json").content("""
            {"productId":"missing","quantity":1,"total":2,"store":"A","purchasedOn":"2024-01-01"}
            """)).andExpect(status().isNotFound());
    }
    @Test void normalizesPackSizesAndFindsBestStore() throws Exception {
        String id=product();purchase(id,"0.5","2.00","Loja A","2024-01-10");purchase(id,"2","6.00","Loja B","2024-02-10");
        var stats=getJson("/api/stats?year=2024");var price=stats.get("prices").get(0);
        assertEquals(3,price.get("latestUnitPrice").asDouble());assertEquals(-25,price.get("changePercent").asDouble());
        assertEquals("Loja B",price.get("cheapestStore").asText());assertEquals(8,stats.get("total").asDouble());
        assertEquals(200,stats.get("months").get(1).get("previousMonthChangePercent").asDouble());
        assertTrue(stats.get("yearChangePercent").isNull());
    }
    @Test void handlesYearBoundaryAndAnnualComparison() throws Exception {
        String id=product();purchase(id,"1","10","A","2023-12-01");purchase(id,"1","15","A","2024-01-01");
        var stats=getJson("/api/stats?year=2024");
        assertEquals(50,stats.get("months").get(0).get("previousMonthChangePercent").asDouble());
        assertEquals(50,stats.get("yearChangePercent").asDouble());assertEquals(12,stats.get("months").size());
    }
    @Test void validatesDatesQuantitiesMoneyAndUnits() throws Exception {
        String id=product();
        for(String[] values:new String[][]{{"0","2","2024-01-01"},{"-1","2","2024-01-01"},{"1","2.001","2024-01-01"},{"1","2","2999-01-01"},{"1.0001","2","2024-01-01"}}) {
            http.perform(post("/api/purchases").contentType("application/json").content("""
              {"productId":"%s","quantity":%s,"total":%s,"store":"A","purchasedOn":"%s"}
              """.formatted(id,values[0],values[1],values[2]))).andExpect(status().isBadRequest());
        }
        http.perform(post("/api/products").contentType("application/json").content("""
            {"name":"Arroz","unit":"bag","initialStock":0,"minimumStock":0}
            """)).andExpect(status().isBadRequest());
        assertEquals(0,getJson("/api/purchases").size());
    }
    @Test void emptyStatsAndInitialStockAreNotSpending() throws Exception {
        http.perform(post("/api/products").contentType("application/json").content("""
            {"name":"Leite","unit":"L","initialStock":3,"minimumStock":1}
            """)).andExpect(status().isCreated());
        var stats=getJson("/api/stats?year=2024");assertEquals(0,stats.get("total").asDouble());
        assertTrue(stats.get("months").get(0).get("previousMonthChangePercent").isNull());
        assertEquals(0,stats.get("prices").size());
    }
    @Test void corsAllowsPagesAndLocalDevelopmentButRejectsOtherOrigins() throws Exception {
        for(String origin:new String[]{"https://andreleal-l2.github.io","http://localhost:5500"}) {
            http.perform(options("/api/purchases").header("Origin",origin)
                .header("Access-Control-Request-Method","POST").header("Access-Control-Request-Headers","content-type")
                .header("Access-Control-Request-Private-Network","true"))
                .andExpect(status().isOk()).andExpect(header().string("Access-Control-Allow-Origin",origin))
                .andExpect(header().string("Access-Control-Allow-Private-Network","true"));
        }
        http.perform(options("/api/products").header("Origin","https://example.com")
            .header("Access-Control-Request-Method","POST")).andExpect(status().isForbidden());
    }
}
