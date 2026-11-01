package pt.foodstock;

import static pt.foodstock.Models.*;
import jakarta.validation.Valid;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
class Api {
    private final StockService service;
    private final JdbcTemplate db;
    Api(StockService service,JdbcTemplate db) { this.service=service;this.db=db; }
    @GetMapping("/health") Map<String,String> health() { db.queryForObject("SELECT 1",Integer.class);return Map.of("status","ok"); }
    @GetMapping("/products") List<Product> products() { return service.products(); }
    @PostMapping("/products") @ResponseStatus(HttpStatus.CREATED)
    Product product(@Valid @RequestBody NewProduct p) { return service.addProduct(p); }
    @GetMapping("/purchases") List<Purchase> purchases() { return service.purchases(); }
    @PostMapping("/purchases") @ResponseStatus(HttpStatus.CREATED)
    Map<String,String> purchase(@Valid @RequestBody NewPurchase p) { return service.addPurchase(p); }
    @PostMapping("/products/{id}/consume") @ResponseStatus(HttpStatus.NO_CONTENT)
    void consume(@PathVariable String id,@Valid @RequestBody Consumption c) { service.consume(id,c); }
    @GetMapping("/stats") Map<String,Object> stats(@RequestParam int year) { return service.statistics(year); }
    @GetMapping("/export") Map<String,Object> export() { return service.export(); }
}
