# FoodStock Manager

Despensa doméstica com API Java local e interface estática para GitHub Pages. Os dados ficam primeiro no navegador e são sincronizados com a API do teu Mac quando ela estiver disponível. O GitHub Pages serve a interface; não recebe o histórico de compras.

## Funcionalidades

- Modo offline com IndexedDB: alimentos, compras, consumo, lista e estatísticas disponíveis sem API.
- Fila de sincronização persistente, recibos idempotentes na API e proteção contra alterações duplicadas.
- Interface escura em azul e cinzento, navegação inferior no telemóvel e fontes locais.
- Alimentos em kg, L ou unidades, estoque inicial e mínimo desejado.
- Compras com quantidade, valor total em EUR, loja e data; entrada automática no estoque.
- Consumo, desperdício e doação com controlo de saldo e histórico de movimentos.
- Gastos mensais, variação contra o mês anterior (incluindo dezembro/janeiro), total anual e comparação com o ano anterior.
- Último preço por unidade, variação contra a compra anterior e melhor preço/loja/data de todo o histórico.
- Gastos por loja, alertas de reposição e exportação JSON.
- Lista de compras planeadas com 39 itens em 9 categorias, notas e quantidades editáveis e marcação de itens no carrinho.

## A tua lista de compras

Na vista **Lista de compras**, usa **Carregar a tua lista** para importar a lista fornecida. A importação é feita uma única vez: repetir o pedido não duplica itens nem apaga alterações. Quantidades como “12 ou 24”, “1 cx” e “6/10” são preservadas como planeamento, sem presumir tamanhos de embalagens. Os itens sem quantidade aparecem como **Por definir**. A indicação sobre legumes congelados pertence à categoria.

Podes marcar itens como **no carrinho** e editar a quantidade planeada e as notas. A marcação por si só não altera o stock nem os gastos. Depois de pagar, usa **Finalizar compras**:

1. Confirma a loja e a data da compra.
2. Em cada item marcado, escolhe um alimento existente ou confirma o nome e a unidade de um novo alimento. Indica a quantidade real e o **total pago por esse item**, não o preço unitário. Intervalos e embalagens ambíguas não são convertidos automaticamente.
3. Usa **Confirmar compras** para registar todo o conjunto. Os alimentos novos são criados, as quantidades entram no stock e os valores entram nas estatísticas. Os itens ficam desmarcados na lista para a próxima compra.

O formulário guarda o rascunho no navegador; podes usar **Guardar para depois** e continuar mais tarde. Nada entra no histórico antes da confirmação. A finalização é uma operação única, aplicada por inteiro na cópia local e numa transação na API. Uma falha ou um reenvio não cria compras parciais ou duplicadas. Se outra sessão já tiver finalizado/desmarcado um dos itens, a operação fica pendente para resolução.

Tudo funciona com a API desligada. A finalização segue automaticamente quando a API atualizada estiver disponível; uma API antiga que ainda não reconheça a operação não apaga a fila. A exportação JSON inclui a lista, o rascunho, a cópia do servidor e todas as alterações por enviar (`schemaVersion: 3`). **Compras** continua disponível para registos avulsos.

## Executar no macOS

Instala um **JDK 21 ou superior** e **Maven 3.9+**. Com Homebrew já instalado:

```sh
brew install openjdk@21 maven
export JAVA_HOME="$(brew --prefix openjdk@21)/libexec/openjdk.jdk/Contents/Home"
export PATH="$JAVA_HOME/bin:$PATH"
java -version
mvn -version
```

Na pasta deste repositório (para atualizar uma instalação existente, para a API antes de recompilar o JAR):

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
4. Abre `https://andreleal-l2.github.io/FoodStock-Manager/` no Mac ou no telemóvel.

Podes usar a interface com a API desligada. Em **Dados → Endereço da API**, o padrão é `http://localhost:8080` para usar no próprio Mac. A configuração do endereço usa localStorage; os dados e a fila usam **IndexedDB**, não dependem da API para serem guardados.

**HTTPS do Pages → API HTTP local:** localhost é tratado como origem potencialmente fiável pelos navegadores, mas as regras de acesso à rede local variam por navegador e versão. Autoriza o acesso local quando for solicitado. A API responde ao preflight CORS e Private Network Access para a origem do Pages. Isto não garante que todos os navegadores aceitem a ligação: se houver bloqueio, usa a interface local acima, sem desativar a segurança do navegador. A ligação ao Pages real precisa de ser testada no teu Mac após publicação. No telemóvel, `localhost` refere-se ao próprio telefone. Para sincronizar com o Mac usa um endereço HTTPS acessível a esse dispositivo, como descrito abaixo.

As origens permitidas por padrão são `https://andreleal-l2.github.io`, `http://localhost:5500` e `http://127.0.0.1:5500`. O path do repositório não faz parte da origem CORS. Se mudares de conta/domínio ou porta do front-end, define `FOODSTOCK_ALLOWED_ORIGINS` como lista de origens completas separadas por vírgulas antes de arrancar a API. Não uses `*`. Todos os sites publicados na mesma origem GitHub Pages partilham essa permissão. Esta versão é pessoal, sem autenticação; mantém a API ligada apenas enquanto precisares e não a exponhas na Internet.

## Como funciona offline e a sincronização

1. Cada alteração é validada e guardada numa transação IndexedDB antes de aparecer como concluída. Se o armazenamento falhar, o formulário mantém os dados e mostra o erro; não confirma nem envia algo que não ficou guardado.
2. Os dados apresentados são a última cópia confirmada da API mais as alterações locais pendentes. Os gastos são somados em cêntimos e as quantidades em milésimos; as estatísticas não precisam da API.
3. A aplicação tenta ligar ao abrir, quando a rede regressa, ao focar/voltar ao separador e a cada 15 segundos enquanto a página está visível. Cada pedido tem timeout de 4 segundos. “Guardado neste navegador” e “Tudo sincronizado” são estados diferentes.
4. A API aplica cada operação numa transação com um recibo persistente. A fila só remove uma operação depois de receber um snapshot que confirme esse recibo. Uma resposta perdida ou um reenvio não duplica compras nem consumo.
5. Uma alteração rejeitada fica na fila. Em **Dados → Sincronização** podes ver o motivo, tentar novamente após corrigir a situação ou descartar explicitamente a alteração. A fila mantém a ordem: operações posteriores podem depender da primeira. O conteúdo também fica no backup JSON. A mesma marcação de carrinho pode ser repetida; notas/quantidades alteradas por outra sessão não são sobrescritas silenciosamente.
6. A identificação da base é persistente. Mudar o endereço para chegar à **mesma base** preserva os dados e as pendências. Se o endereço apontar para outra base, a sincronização bloqueia e preserva a cópia local; volta ao endereço certo ou exporta os dados antes de planear uma migração.

O service worker guarda a interface e as fontes depois do primeiro acesso bem-sucedido. Assim, ela pode voltar a abrir sem Internet. Na primeira visita é necessária Internet (ou o servidor local) para obter esses ficheiros. Uma página fechada ou um telefone suspenso não pode manter tentativas contínuas: a fila persiste e as tentativas regressam ao reabrir. Atualizações do service worker são ativadas quando os separadores da versão anterior fecham.

Cada navegador tem a sua cópia. Os dados do Safari não aparecem automaticamente no Chrome ou noutro telefone; os dispositivos encontram-se na mesma API quando conseguem ligar. Limpar os dados do site, usar navegação privada ou o navegador remover armazenamento pode apagar a cópia local. **Exporta backups**, sobretudo enquanto houver alterações por enviar. Mudar a origem do site (por exemplo, abrir uma cópia local em vez do Pages) também cria um armazenamento separado.

## Ligar o telemóvel à API do Mac por HTTPS privado

Uma opção é **Tailscale Serve**, mantendo a API em loopback e sem a publicar na Internet:

1. Instala o Tailscale no Mac e no telemóvel e liga ambos à tua mesma conta/rede privada. Mantém o Mac e a API ligados.
2. No Mac, com a API em `127.0.0.1:8080`, executa:

```sh
tailscale serve --bg http://127.0.0.1:8080
```

Se o comando não estiver no PATH da aplicação macOS, usa o binário da aplicação:

```sh
/Applications/Tailscale.app/Contents/MacOS/Tailscale serve --bg http://127.0.0.1:8080
```

3. Segue a indicação do Tailscale para ativar HTTPS/certificados da tua rede, caso apareça. Copia o endereço HTTPS que o comando devolver.
4. No FoodStock do telefone, em **Dados → Endereço da API**, guarda esse endereço completo, sem `/api` no final. O telefone precisa da ligação Tailscale ativa para enviar a fila. Pode continuar a registar dados sem essa ligação.

A API continua sem autenticação própria, por isso usa o **Serve privado**, limitado aos teus dispositivos, e não um túnel público/Funnel. Não é necessário desativar a verificação TLS. Mais informação: [documentação oficial do Tailscale Serve](https://tailscale.com/kb/1242/tailscale-serve).

Esta configuração tem de ser executada nos teus dispositivos. O ambiente de desenvolvimento na nuvem não instala Tailscale nem configura certificados no teu Mac/telefone. O fluxo foi validado no Chromium com API local; a conectividade real por Tailscale e as permissões Safari/iOS precisam de confirmação nesses dispositivos.

## Como registar e interpretar dados

- Em **Finalizar compras**, podes criar o alimento durante a confirmação. Para um registo avulso em **Compras**, cria-o primeiro na despensa. Mantém a unidade consistente: duas embalagens de 500 g de arroz = **1 kg**; regista o total pago pelas duas. Para dúzias de ovos em `un`, regista 12.
- Estoque inicial representa o que já tens e **não** gera despesa. Se quiseres incluir o preço dessa compra no histórico, começa com estoque zero e regista a compra. Evita contar a mesma quantidade duas vezes.
- Valores monetários usam decimal exato com até 2 casas; quantidades aceitam até 3. Não são permitidos preços zero, quantidades negativas ou datas futuras.
- A variação de preço usa `(último preço/unidade − anterior) / anterior × 100`. Uma descida tem sinal negativo. Ex.: 0,5 kg por €2 → €4/kg; depois 2 kg por €6 → €3/kg, descida de 25%.
- O melhor preço é o menor preço por unidade no histórico do **mesmo produto**, não uma cotação atual. Se qualidade ou marca forem diferentes, cria produtos diferentes. Em compras na mesma data, o registo mais recente desempata.
- Variações de gastos incluem quantidade e composição das compras; **não são uma medida de inflação**. Os meses sem registos contam como zero; se a base for zero, a variação aparece sem comparação. A comparação anual usa os totais registados de cada ano, sem ajustar meses incompletos. A tabela de preços usa todo o histórico, independentemente do ano selecionado.
- Usa o mesmo nome para a mesma loja. Nesta versão ainda não há edição/eliminação de compras, importação de talões/JSON ou autenticação própria da API. Vários navegadores podem sincronizar com a mesma base. Uma compra guardada na fila é reenviada com o mesmo identificador até ser confirmada; não voltes a criar a mesma compra só porque a API está desligada.

## Dados e cópias de segurança

O H2 guarda a base em `backend/data/foodstock.mv.db`, fora do controlo Git. Arranca sempre a API a partir de `backend/` para usar a mesma base. Não envies `data/` para o GitHub.

Para um backup restaurável, **para a API** e copia a pasta `backend/data` para um destino seguro. Para restaurar, com a API parada, preserva a pasta atual e repõe a cópia. Usa a mesma versão da aplicação/base. O botão de exportação funciona mesmo sem API e inclui a projeção local, a última base confirmada e as operações pendentes. O endpoint `/api/export` contém apenas os dados que a API já recebeu. Ainda não existe importador JSON. Não apagues a cópia local antes de a fila estar confirmada ou de exportares o conteúdo pendente.

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
| GET | `/api/export` | Exportação da base da API |
| POST | `/api/sync/snapshot` | Snapshot consistente e confirmação de recibos pendentes |
| POST | `/api/sync/operations` | Aplicar uma operação uma única vez |

```sh
cd backend
mvn verify
```

Os testes usam uma base H2 em memória separada e cobrem compras, consumo, atomicidade em erros, limites do estoque, validações, preços normalizados, comparação mensal/anual e CORS. O CI também verifica a sintaxe do JavaScript. A publicação do Pages e o acesso à rede local no macOS são validações separadas.

### Testes do navegador e do modelo offline

```sh
npm ci
npm test
# API já compilada com mvn verify. Chrome/Chromium instalado:
FOODSTOCK_BROWSER=/usr/bin/chromium npm run test:browser
```

No macOS, `FOODSTOCK_BROWSER` pode apontar para `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`. O teste usa o JDK selecionado por `JAVA_HOME` (ou `FOODSTOCK_JAVA`) e o JAR compilado em `backend/target` (ou `FOODSTOCK_JAR`). Cria o seu próprio servidor estático, perfil do navegador e base H2 temporários; não toca na base de uso real.

A suite verifica API inicialmente desligada, criação e consumo offline, importação/edição da lista, reload sem rede, navegador fechado/reaberto, envio automático ao ligar a API, resposta perdida depois da gravação, conflitos, dois separadores, falha do armazenamento, reinício da API e layout em sete larguras. O CI executa os testes Java, os seis testes do modelo local e os checks de sintaxe. A suite completa de navegador é um comando separado.
