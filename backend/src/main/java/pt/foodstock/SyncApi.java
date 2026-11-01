package pt.foodstock;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import jakarta.validation.Valid;
import jakarta.validation.Validator;
import jakarta.validation.constraints.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import static pt.foodstock.Models.*;

@RestController
@RequestMapping("/api/sync")
class SyncApi {
    record Pull(UUID expectedInstanceId, @NotNull @Size(max=1000) List<@NotNull UUID> pendingIds) {}
    record Operation(@NotNull UUID operationId, @NotNull UUID instanceId,
                     @NotBlank @Size(max=30) String kind, @Size(max=80) String entityId, @NotNull JsonNode data) {}
    private final SyncService sync;
    SyncApi(SyncService sync) { this.sync=sync; }
    @PostMapping("/snapshot") Map<String,Object> snapshot(@Valid @RequestBody Pull pull) { return sync.snapshot(pull); }
    @PostMapping("/operations") Map<String,Object> operation(@Valid @RequestBody Operation operation) { return sync.apply(operation); }
}

@Service
class SyncService {
    record ShoppingChange(@NotNull @Size(max=120) String quantityText, @NotNull @Size(max=250) String notes,
                          @NotNull String expectedQuantityText,@NotNull String expectedNotes,
                          @Min(0) @Max(38) Integer templateIndex) {}
    record ShoppingCheck(@NotNull Boolean checked,@Min(0) @Max(38) Integer templateIndex) {}
    private final JdbcTemplate db;
    private final StockService stock;
    private final ShoppingService shopping;
    private final ObjectMapper json;
    private final Validator validator;
    SyncService(JdbcTemplate db,StockService stock,ShoppingService shopping,ObjectMapper json,Validator validator) {
        this.db=db;this.stock=stock;this.shopping=shopping;this.json=json;this.validator=validator;
    }
    private String instance(boolean lock) {
        return db.queryForObject("SELECT instance_id FROM sync_state WHERE id=1"+(lock?" FOR UPDATE":""),String.class);
    }
    private void checkInstance(UUID expected,String actual) {
        if(expected!=null&&!expected.toString().equals(actual)) throw problem(HttpStatus.CONFLICT,"Esta API usa uma base diferente. Os dados locais foram preservados. Verifica o endereço da API e exporta os teus dados antes de mudar de base.");
    }
    @Transactional(isolation=Isolation.REPEATABLE_READ)
    public Map<String,Object> snapshot(SyncApi.Pull pull) {
        String instance=instance(true);checkInstance(pull.expectedInstanceId(),instance);
        var acknowledged=new ArrayList<String>();
        for(var id:pull.pendingIds()) if(Boolean.TRUE.equals(db.queryForObject("SELECT EXISTS(SELECT 1 FROM sync_receipts WHERE operation_id=?)",Boolean.class,id.toString()))) acknowledged.add(id.toString());
        var data=new LinkedHashMap<>(stock.export());data.put("shoppingList",shopping.list());data.put("schemaVersion",3);
        return Map.of("instanceId",instance,"data",data,"acknowledged",acknowledged);
    }
    @Transactional
    public Map<String,Object> apply(SyncApi.Operation op) {
        String instance=instance(true);checkInstance(op.instanceId(),instance);
        if(!op.data().isObject())throw problem(HttpStatus.BAD_REQUEST,"Formato de alteração inválido.");
        String fingerprint=fingerprint(op);
        var receipts=db.query("SELECT fingerprint FROM sync_receipts WHERE operation_id=?",(r,n)->r.getString(1),op.operationId().toString());
        if(!receipts.isEmpty()) {
            if(!receipts.getFirst().equals(fingerprint))throw problem(HttpStatus.CONFLICT,"Este identificador já foi usado para outra alteração.");
            return Map.of("operationId",op.operationId(),"duplicate",true);
        }
        try {
            switch(op.kind()) {
                case "PRODUCT_CREATE" -> stock.addProductWithId(entityUuid(op.entityId()),decode(op.data(),NewProduct.class));
                case "PURCHASE_CREATE" -> stock.addPurchaseWithId(entityUuid(op.entityId()),decode(op.data(),NewPurchase.class));
                case "CONSUME" -> stock.consume(entityUuid(op.entityId()),decode(op.data(),Consumption.class));
                case "SHOPPING_IMPORT" -> shopping.importTemplate();
                case "SHOPPING_CHECK" -> {
                    var value=decode(op.data(),ShoppingCheck.class);
                    shopping.check(shoppingId(op.entityId(),value.templateIndex()),new ShoppingService.Check(value.checked()));
                }
                case "SHOPPING_DETAILS" -> {
                    var value=decode(op.data(),ShoppingChange.class);
                    String id=shoppingId(op.entityId(),value.templateIndex());
                    var current=db.queryForMap("SELECT quantity_text,notes FROM shopping_items WHERE id=? FOR UPDATE",id);
                    boolean desired=Objects.equals(current.get("QUANTITY_TEXT"),value.quantityText().strip())&&Objects.equals(current.get("NOTES"),value.notes().strip());
                    boolean expected=Objects.equals(current.get("QUANTITY_TEXT"),value.expectedQuantityText())&&Objects.equals(current.get("NOTES"),value.expectedNotes());
                    if(!desired&&!expected)throw problem(HttpStatus.CONFLICT,"Este item foi alterado noutra sessão. As tuas notas continuam guardadas no navegador; exporta-as ou resolve a alteração pendente.");
                    shopping.details(id,new ShoppingService.Details(value.quantityText(),value.notes()));
                }
                default -> throw problem(HttpStatus.BAD_REQUEST,"Tipo de alteração desconhecido.");
            }
            db.update("INSERT INTO sync_receipts(operation_id,fingerprint) VALUES(?,?)",op.operationId().toString(),fingerprint);
        } catch(DuplicateKeyException e) { throw problem(HttpStatus.CONFLICT,"Já existe um registo com este identificador. A alteração local foi preservada."); }
        return Map.of("operationId",op.operationId(),"duplicate",false);
    }
    private String shoppingId(String id,Integer index) {
        var ids=index!=null ? db.query("SELECT id FROM shopping_items WHERE sort_order=?",(r,n)->r.getString(1),index)
                           : db.query("SELECT id FROM shopping_items WHERE id=?",(r,n)->r.getString(1),id);
        if(ids.isEmpty())throw problem(HttpStatus.NOT_FOUND,"Item da lista não encontrado. Importa a lista antes de sincronizar as marcações.");
        return ids.getFirst();
    }
    private String entityUuid(String value) {
        try { return UUID.fromString(value).toString(); } catch(Exception e) { throw problem(HttpStatus.BAD_REQUEST,"Identificador de registo inválido."); }
    }
    private <T> T decode(JsonNode node,Class<T> type) {
        try {
            T value=json.treeToValue(node,type);
            if(value==null||!validator.validate(value).isEmpty())throw new IllegalArgumentException();
            return value;
        } catch(Exception e) { throw problem(HttpStatus.BAD_REQUEST,"A alteração contém campos inválidos. Verifica quantidades, preços e datas."); }
    }
    private JsonNode canonical(JsonNode node) {
        if(node.isObject()) {
            ObjectNode result=json.createObjectNode();var names=new TreeSet<String>();node.fieldNames().forEachRemaining(names::add);
            for(var name:names)result.set(name,canonical(node.get(name)));return result;
        }
        if(node.isArray()) { ArrayNode result=json.createArrayNode();node.forEach(value->result.add(canonical(value)));return result; }
        return node;
    }
    private String fingerprint(SyncApi.Operation op) {
        try {
            String value=op.kind()+"\n"+Objects.toString(op.entityId(),"")+"\n"+canonical(op.data());
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch(Exception e) { throw new IllegalStateException(e); }
    }
    private ResponseStatusException problem(HttpStatus status,String message) { return new ResponseStatusException(status,message); }
}
