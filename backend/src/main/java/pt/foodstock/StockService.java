package pt.foodstock;

import static pt.foodstock.Models.*;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.YearMonth;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import static org.springframework.http.HttpStatus.*;

@Service
class StockService {
    private final JdbcTemplate db;
    StockService(JdbcTemplate db) { this.db = db; }
    List<Product> products() {
        return db.query("SELECT * FROM products ORDER BY LOWER(name)", (r,n) -> new Product(
            r.getString("id"), r.getString("name"), r.getString("unit"), r.getBigDecimal("stock"), r.getBigDecimal("minimum_stock")));
    }
    List<Purchase> purchases() {
        return db.query("SELECT p.*, i.name, i.unit FROM purchases p JOIN products i ON i.id=p.product_id ORDER BY p.purchased_on DESC,p.created_at DESC,p.id DESC",
            (r,n) -> new Purchase(r.getString("id"),r.getString("product_id"),r.getString("name"),r.getString("unit"),
                r.getBigDecimal("quantity"),r.getBigDecimal("total"),r.getString("store"),r.getDate("purchased_on").toLocalDate()));
    }
    @Transactional
    Product addProduct(NewProduct p) {
        return addProductWithId(UUID.randomUUID().toString(),p);
    }
    @Transactional
    Product addProductWithId(String id,NewProduct p) {
        db.update("INSERT INTO products(id,name,unit,stock,minimum_stock) VALUES(?,?,?,?,?)",id,p.name().strip(),p.unit(),p.initialStock(),p.minimumStock());
        if (p.initialStock().signum() > 0) movement(id,p.initialStock(),"Estoque inicial (sem despesa associada)");
        return products().stream().filter(v -> v.id().equals(id)).findFirst().orElseThrow();
    }
    private BigDecimal lockStock(String id) {
        var values=db.query("SELECT stock FROM products WHERE id=? FOR UPDATE",(r,n)->r.getBigDecimal(1),id);
        if(values.isEmpty()) throw new ResponseStatusException(NOT_FOUND,"Produto não encontrado.");
        return values.getFirst();
    }
    @Transactional
    Map<String,String> addPurchase(NewPurchase p) {
        return addPurchaseWithId(UUID.randomUUID().toString(),p);
    }
    @Transactional
    Map<String,String> addPurchaseWithId(String id,NewPurchase p) {
        lockStock(p.productId());
        db.update("INSERT INTO purchases(id,product_id,quantity,total,store,purchased_on) VALUES(?,?,?,?,?,?)",
            id,p.productId(),p.quantity(),p.total(),p.store().strip(),p.purchasedOn());
        db.update("UPDATE products SET stock=stock+? WHERE id=?",p.quantity(),p.productId());
        movement(p.productId(),p.quantity(),"Compra "+id);
        return Map.of("id",id);
    }
    @Transactional
    void consume(String id,Consumption c) {
        BigDecimal stock=lockStock(id);
        if(stock.compareTo(c.quantity())<0) throw new ResponseStatusException(CONFLICT,"Quantidade superior ao estoque disponível.");
        db.update("UPDATE products SET stock=stock-? WHERE id=?",c.quantity(),id);
        movement(id,c.quantity().negate(),c.reason().strip());
    }
    private void movement(String id,BigDecimal q,String reason) {
        db.update("INSERT INTO movements(id,product_id,quantity,reason) VALUES(?,?,?,?)",UUID.randomUUID().toString(),id,q,reason);
    }
    private static BigDecimal sum(List<Purchase> list) {
        return list.stream().map(Purchase::total).reduce(BigDecimal.ZERO,BigDecimal::add);
    }
    private static BigDecimal unitPrice(Purchase p) { return p.total().divide(p.quantity(),6,RoundingMode.HALF_UP); }
    private static BigDecimal change(BigDecimal now,BigDecimal before) {
        return before.signum()==0 ? null : now.subtract(before).multiply(BigDecimal.valueOf(100)).divide(before,2,RoundingMode.HALF_UP);
    }
    Map<String,Object> statistics(int year) {
        if(year<2000 || year>2100) throw new ResponseStatusException(BAD_REQUEST,"Ano fora do intervalo 2000–2100.");
        var all=purchases();
        var months=new ArrayList<Map<String,Object>>();
        for(int m=1;m<=12;m++) {
            var month=YearMonth.of(year,m);
            BigDecimal total=sum(all.stream().filter(p->YearMonth.from(p.purchasedOn()).equals(month)).toList());
            BigDecimal previous=sum(all.stream().filter(p->YearMonth.from(p.purchasedOn()).equals(month.minusMonths(1))).toList());
            var entry=new LinkedHashMap<String,Object>();
            entry.put("month",month.toString());entry.put("total",total);entry.put("previousMonthChangePercent",change(total,previous));months.add(entry);
        }
        BigDecimal total=sum(all.stream().filter(p->p.purchasedOn().getYear()==year).toList());
        BigDecimal previous=sum(all.stream().filter(p->p.purchasedOn().getYear()==year-1).toList());
        var prices=new ArrayList<Map<String,Object>>();
        for(var product: products()) {
            var history=all.stream().filter(p->p.productId().equals(product.id())).toList();
            if(history.isEmpty()) continue;
            var latest=history.getFirst();
            var cheapest=history.stream().min(Comparator.comparing(StockService::unitPrice)).orElseThrow();
            var entry=new LinkedHashMap<String,Object>();
            entry.put("productId",product.id());entry.put("name",product.name());entry.put("unit",product.unit());
            entry.put("latestUnitPrice",unitPrice(latest));entry.put("latestStore",latest.store());entry.put("latestDate",latest.purchasedOn());
            entry.put("previousUnitPrice",history.size()>1?unitPrice(history.get(1)):null);
            entry.put("changePercent",history.size()>1?change(unitPrice(latest),unitPrice(history.get(1))):null);
            entry.put("cheapestUnitPrice",unitPrice(cheapest));entry.put("cheapestStore",cheapest.store());entry.put("cheapestDate",cheapest.purchasedOn());
            entry.put("purchaseCount",history.size());prices.add(entry);
        }
        var result=new LinkedHashMap<String,Object>();
        result.put("year",year);result.put("total",total);result.put("previousYearTotal",previous);
        result.put("yearChangePercent",change(total,previous));result.put("months",months);result.put("prices",prices);
        result.put("stores",all.stream().filter(p->p.purchasedOn().getYear()==year).collect(java.util.stream.Collectors.groupingBy(Purchase::store,
            TreeMap::new,java.util.stream.Collectors.reducing(BigDecimal.ZERO,Purchase::total,BigDecimal::add))));
        return result;
    }
    @Transactional(readOnly=true)
    Map<String,Object> export() {
        return Map.of("schemaVersion",1,"products",products(),"purchases",purchases(),
            "movements",db.queryForList("SELECT * FROM movements ORDER BY created_at,id"));
    }
}
