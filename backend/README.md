# API Java anterior — apenas para exportação/migração

A aplicação ativa usa Supabase; não precisa de Java nem desta API. O código antigo permanece para poderes exportar uma base H2 existente sem perder dados. Não publiques esta API sem autenticação na Internet.

Se os dados já aparecem no FoodStock no teu navegador, exporta o JSON ou usa **Dados → Migrar dados deste navegador** na versão nova. Essa cópia pode incluir operações offline que a API antiga ainda não recebeu.

Para exportar só o que está no H2:

1. Preserva uma cópia de `backend/data/` com a API parada. Não envies essa pasta para o GitHub.
2. Com Java 21 e Maven instalados, executa sempre a partir de `backend/`:

```sh
mvn spring-boot:run
```

3. Noutro terminal, guarda a exportação:

```sh
curl --fail http://localhost:8080/api/export --output foodstock-java-export.json
```

4. Para a API. Configura o Supabase e importa o JSON para uma conta vazia em **Dados → Importar backup JSON**.

O endpoint antigo `/api/export` não inclui a lista de compras. Para preservar a lista e as alterações ainda por enviar, prefere o backup do navegador.

Não mistures exports sobrepostos da API e do navegador. Prefere a cópia com os dados mais completos. A migração preserva o stock atual sem voltar a somar as compras antigas. A aplicação nova não sincroniza com a API Java, não altera a base H2 e não precisa de Tailscale.
