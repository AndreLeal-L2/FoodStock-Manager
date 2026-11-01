package pt.foodstock;

import java.math.BigDecimal;
import java.time.LocalDate;
import jakarta.validation.constraints.*;

final class Models {
    record Product(String id, String name, String unit, BigDecimal stock, BigDecimal minimumStock) {}
    record Purchase(String id, String productId, String productName, String unit, BigDecimal quantity,
                    BigDecimal total, String store, LocalDate purchasedOn) {}
    record NewProduct(
        @NotBlank @Size(max=120) String name,
        @NotNull @Pattern(regexp="kg|L|un") String unit,
        @NotNull @DecimalMin("0") @Digits(integer=9,fraction=3) BigDecimal initialStock,
        @NotNull @DecimalMin("0") @Digits(integer=9,fraction=3) BigDecimal minimumStock) {}
    record NewPurchase(
        @NotBlank String productId,
        @NotNull @DecimalMin(value="0",inclusive=false) @Digits(integer=9,fraction=3) BigDecimal quantity,
        @NotNull @DecimalMin(value="0",inclusive=false) @Digits(integer=9,fraction=2) BigDecimal total,
        @NotBlank @Size(max=120) String store,
        @NotNull @PastOrPresent LocalDate purchasedOn) {}
    record Consumption(
        @NotNull @DecimalMin(value="0",inclusive=false) @Digits(integer=9,fraction=3) BigDecimal quantity,
        @NotBlank @Size(max=200) String reason) {}
}
