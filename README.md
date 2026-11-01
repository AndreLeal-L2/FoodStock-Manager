# FoodStock Manager

Despensa doméstica com API Java local e interface estática para GitHub Pages. Os dados ficam no computador onde a API corre; o GitHub não recebe o histórico de compras.

## Funcionalidades da primeira versão

- Alimentos em kg, L ou unidades, estoque inicial e mínimo desejado.
- Compras com quantidade, valor total em EUR, loja e data; entrada automática no estoque.
- Consumo, desperdício e doação com controlo de saldo e histórico de movimentos.
- Gastos mensais, variação contra o mês anterior (incluindo dezembro/janeiro), total anual e comparação com o ano anterior.
- Último preço por unidade, variação contra a compra anterior e melhor preço/loja/data de todo o histórico.
- Gastos por loja, alertas de reposição e exportação JSON.
- Lista de compras planeadas com 39 itens em 9 categorias, notas e quantidades editáveis e marcação de itens no carrinho.

## A tua lista de compras

Na vista **Lista de compras**, usa **Carregar a tua lista** para importar a lista fornecida. A importação é feita uma única vez: repetir o pedido não duplica itens nem apaga alterações. Quantidades como “12 ou 24”, “1 cx” e “6/10” são preservadas como planeamento, sem presumir tamanhos de embalagens. Os itens sem quantidade aparecem como **Por definir**. A indicação sobre legumes congelados pertence à categoria.

Podes marcar itens como **no carrinho** e editar a quantidade planeada e as notas. Tudo fica na base local da API, incluindo depois de reiniciar. Isto não cria produtos, movimenta estoque ou regista despesas: depois de pagar, usa **Compras** com a quantidade real, o preço, a data e a loja. A exportação JSON inclui também esta lista (`schemaVersion: 2`). A lista não faz importação de despesas, nem tem sincronização offline: precisa da API ligada, tal como o resto da aplicação.

## Executar no macOS

Instala um **JDK 21 ou superior** e **Maven 3.9+**. Com Homebrew já instalado:

```sh
brew install openjdk@21 maven
export JAVA_HOME="$(brew --prefix openjdk@21)/libexec/openjdk.jdk/Contents/Home"
export PATH="$JAVA_HOME/bin:$PATH"
java -version
mvn -version
```

Na pasta deste repositório:

```sh
cd backend
mvn verify
mvn spring-boot:run
```

Mantém este terminal aberto. A API escuta **apenas em 127.0.0.1:8080**; não é exposta na rede doméstica. Confirma a resposta `{"status":"ok"}`:

```sh
curl -f http://localhost:8080/api/health
```

Para testar a interface sem GitHub Pages, abre outro terminal na raiz do repositório (Python 3 necessário):

```sh
python3 -m http.server 5500 --bind 127.0.0.1 --directory docs
```

Abre `http://localhost:5500`. Em Windows e Linux, com JDK 21+, Maven e Python 3 disponíveis, os comandos do projeto são iguais (no Windows, pode ser necessário `py -m http.server ...`).

Para usar o JAR compilado, executa **sempre a partir de backend/**:

```sh
java -jar target/foodstock-0.1.0.jar
```

## Publicar a interface no GitHub Pages

1. Guarda e envia os ficheiros para a branch `main` do repositório.
2. Em **Settings → Pages → Build and deployment**, seleciona **GitHub Actions**.
3. Executa o workflow “Front-end no GitHub Pages” ou deixa o push de `docs/` ativá-lo.
4. Abre `https://andreleal-l2.github.io/FoodStock-Manager/` no mesmo Mac que executa a API.

A API precisa de continuar ligada. Em “Ligação e dados”, o endereço padrão é `http://localhost:8080`. O endereço da API é a única informação guardada no localStorage do navegador.

**HTTPS do Pages → API HTTP local:** localhost é tratado como origem potencialmente fiável pelos navegadores, mas as regras de acesso à rede local variam por navegador e versão. Autoriza o acesso local quando for solicitado. A API responde ao preflight CORS e Private Network Access para a origem do Pages. Isto não garante que todos os navegadores aceitem a ligação: se houver bloqueio, usa a interface local acima, sem desativar a segurança do navegador. A ligação ao Pages real precisa de ser testada no teu Mac após publicação. Não uses o site de outro dispositivo para tentar alcançar a API do Mac: `localhost` refere-se ao dispositivo que abre o site.

As origens permitidas por padrão são `https://andreleal-l2.github.io`, `http://localhost:5500` e `http://127.0.0.1:5500`. O path do repositório não faz parte da origem CORS. Se mudares de conta/domínio ou porta do front-end, define `FOODSTOCK_ALLOWED_ORIGINS` como lista de origens completas separadas por vírgulas antes de arrancar a API. Não uses `*`. Todos os sites publicados na mesma origem GitHub Pages partilham essa permissão. Esta versão é pessoal, sem autenticação; mantém a API ligada apenas enquanto precisares e não a exponhas na Internet.

## Como registar e interpretar dados

- Cria primeiro o alimento. Mantém a unidade consistente: duas embalagens de 500 g de arroz = **1 kg**; regista o total pago pelas duas. Para dúzias de ovos em `un`, regista 12.
- Estoque inicial representa o que já tens e **não** gera despesa. Se quiseres incluir o preço dessa compra no histórico, começa com estoque zero e regista a compra. Evita contar a mesma quantidade duas vezes.
- Valores monetários usam decimal exato com até 2 casas; quantidades aceitam até 3. Não são permitidos preços zero, quantidades negativas ou datas futuras.
- A variação de preço usa `(último preço/unidade − anterior) / anterior × 100`. Uma descida tem sinal negativo. Ex.: 0,5 kg por €2 → €4/kg; depois 2 kg por €6 → €3/kg, descida de 25%.
- O melhor preço é o menor preço por unidade no histórico do **mesmo produto**, não uma cotação atual. Se qualidade ou marca forem diferentes, cria produtos diferentes. Em compras na mesma data, o registo mais recente desempata.
- Variações de gastos incluem quantidade e composição das compras; **não são uma medida de inflação**. Os meses sem registos contam como zero; se a base for zero, a variação aparece sem comparação. A comparação anual usa os totais registados de cada ano, sem ajustar meses incompletos. A tabela de preços usa todo o histórico, independentemente do ano selecionado.
- Usa o mesmo nome para a mesma loja. Nesta versão ainda não há edição/eliminação de compras, importação de talões/JSON, sincronização entre computadores ou autenticação. Confirma os valores antes de guardar; uma falha de ligação após enviar uma compra exige consultar o histórico antes de repetir, para evitar duplicados.

## Dados e cópias de segurança

O H2 guarda a base em `backend/data/foodstock.mv.db`, fora do controlo Git. Arranca sempre a API a partir de `backend/` para usar a mesma base. Não envies `data/` para o GitHub.

Para um backup restaurável, **para a API** e copia a pasta `backend/data` para um destino seguro. Para restaurar, com a API parada, preserva a pasta atual e repõe a cópia. Usa a mesma versão da aplicação/base. A exportação JSON é uma cópia legível de produtos, compras e movimentos; ainda não existe importador JSON.

Configuração opcional: `PORT` (padrão 8080), `FOODSTOCK_DB_URL` (URL JDBC H2) e `FOODSTOCK_ALLOWED_ORIGINS`. A base local não requer credenciais externas. Não arranques duas instâncias sobre o mesmo ficheiro H2.

## API e testes

| Método | Endpoint | Função |
| --- | --- | --- |
| GET | `/api/health` | Verifica a ligação à base |
| GET / POST | `/api/products` | Consultar / criar alimento |
| POST | `/api/products/{id}/consume` | Retirar quantidade com motivo |
| GET / POST | `/api/purchases` | Consultar / registar compra |
| GET | `/api/stats?year=2026` | Gastos e preços normalizados |
| GET | `/api/shopping-list` | Lista planeada e estado de importação |
| POST | `/api/shopping-list/import` | Carregar a lista fornecida, sem duplicados |
| POST | `/api/shopping-list/{id}/check` | Marcar ou desmarcar no carrinho |
| POST | `/api/shopping-list/{id}/details` | Editar quantidade planeada e notas |
| GET | `/api/export` | Exportação JSON |

```sh
cd backend
mvn verify
```

Os testes usam uma base H2 em memória separada e cobrem compras, consumo, atomicidade em erros, limites do estoque, validações, preços normalizados, comparação mensal/anual e CORS. O CI também verifica a sintaxe do JavaScript. A publicação do Pages e o acesso à rede local no macOS são validações separadas.
