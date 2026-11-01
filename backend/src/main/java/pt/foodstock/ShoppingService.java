package pt.foodstock;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.constraints.*;
import java.io.IOException;
import java.util.*;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import static org.springframework.http.HttpStatus.NOT_FOUND;

@Service
class ShoppingService {
    record Item(String id, String category, String categoryNote, String name,
                String quantityText, String notes, boolean checked, int templateIndex) {}
    record ShoppingList(boolean templateImported, List<Item> items) {}
    record Check(@NotNull Boolean checked) {}
    record Details(@NotNull @Size(max=120) String quantityText, @NotNull @Size(max=250) String notes) {}
    record Template(List<Group> groups) {}
    record Group(String category, String note, List<Entry> items) {}
    record Entry(String name, String quantityText, String notes) {}

    private final JdbcTemplate db;
    private final Template template;
    ShoppingService(JdbcTemplate db, ObjectMapper mapper) throws IOException {
        this.db=db;
        try (var stream=new ClassPathResource("shopping-template.json").getInputStream()) {
            this.template=mapper.readValue(stream,Template.class);
        }
    }
    @Transactional(readOnly=true)
    ShoppingList list() {
        boolean imported=Boolean.TRUE.equals(db.queryForObject("SELECT template_imported FROM shopping_list_state WHERE id=1",Boolean.class));
        var items=db.query("SELECT * FROM shopping_items ORDER BY sort_order",(r,n)->new Item(
            r.getString("id"),r.getString("category"),r.getString("category_note"),r.getString("name"),
            r.getString("quantity_text"),r.getString("notes"),r.getBoolean("checked"),r.getInt("sort_order")));
        return new ShoppingList(imported,items);
    }
    @Transactional
    ShoppingList importTemplate() {
        boolean imported=Boolean.TRUE.equals(db.queryForObject("SELECT template_imported FROM shopping_list_state WHERE id=1 FOR UPDATE",Boolean.class));
        if(!imported) {
            int order=0;
            for(var group:template.groups()) for(var item:group.items()) {
                db.update("INSERT INTO shopping_items(id,category,category_note,name,quantity_text,notes,checked,sort_order) VALUES(?,?,?,?,?,?,FALSE,?)",
                    UUID.nameUUIDFromBytes(("foodstock-shopping-v1:"+order).getBytes(java.nio.charset.StandardCharsets.UTF_8)).toString(),group.category(),group.note(),item.name(),item.quantityText(),item.notes(),order++);
            }
            db.update("UPDATE shopping_list_state SET template_imported=TRUE WHERE id=1");
        }
        return list();
    }
    void check(String id, Check value) {
        requireUpdated(db.update("UPDATE shopping_items SET checked=? WHERE id=?",value.checked(),id));
    }
    void details(String id, Details value) {
        requireUpdated(db.update("UPDATE shopping_items SET quantity_text=?,notes=? WHERE id=?",value.quantityText().strip(),value.notes().strip(),id));
    }
    private void requireUpdated(int updated) {
        if(updated==0) throw new ResponseStatusException(NOT_FOUND,"Item da lista não encontrado.");
    }
}
