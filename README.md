# FoodStock Manager

Despensa, lista de compras, gastos e preços. Front-end estático no **GitHub Pages**, dados privados em **Supabase/PostgreSQL**, com **Supabase Auth**. O Mac já não precisa de executar uma API Java nem de ficar ligado para o telemóvel sincronizar.

Site: **https://andreleal-l2.github.io/FoodStock-Manager/**

A aplicação funciona offline com IndexedDB e uma fila persistente. O projeto Supabase do FoodStock já está definido em `docs/config.mjs`, com o URL e a chave pública fornecidos pelo responsável. A aplicação mostra apenas a conta FoodStock (email/palavra-passe); não pede configuração do fornecedor aos utilizadores. Credenciais administrativas ficam fora do site. A identificação por fotografia usa agora um motor próprio de visão computacional clássica, executado no navegador: não usa OpenAI, modelos de IA, Edge Functions de visão ou APIs de reconhecimento pagas.

## Administração do Supabase

Os passos seguintes destinam-se ao responsável pelo projeto, por exemplo ao criar uma instalação própria. Os utilizadores apenas abrem o site e criam/iniciam sessão na conta FoodStock. O responsável informou que já executou a migração do projeto atual; não é necessário repeti-la.

1. Cria um projeto em [Supabase](https://supabase.com/dashboard). Guarda a palavra-passe da base em privado.
2. Abre **SQL Editor**, cria uma query e executa o conteúdo completo de [supabase/migrations/202611020001_foodstock.sql](supabase/migrations/202611020001_foodstock.sql). O ficheiro destina-se a uma instalação nova; para futuras alterações, adiciona migrações, não repitas a inicial sobre tabelas existentes.
3. Em **Authentication → Providers**, ativa Email/Password e a confirmação de email. Em **URL Configuration**, usa `https://andreleal-l2.github.io/FoodStock-Manager/` como Site URL. Cria/confirma a tua conta. Depois de criares as contas necessárias, podes desativar novos registos públicos no Supabase.
4. Em **Project Settings → API** (ou **Connect → API Keys**), copia o **Project URL** e a chave **publishable** ou a antiga **anon**. Não uses `service_role`, `sb_secret_…` nem a palavra-passe da base no site.
5. Define o URL e a chave pública em [docs/config.mjs](docs/config.mjs), atualiza a revisão dos ficheiros com `npm run release:client -- NOVA_REVISAO` e publica o site. Estes valores já estão preenchidos para esta instalação.
6. No FoodStock, abre **Dados → A tua conta FoodStock**, cria/confirma uma conta e inicia sessão. Usa a mesma conta no Mac e no telemóvel. A conta do painel administrativo Supabase e a conta da aplicação são separadas.

O URL e a publishable/anon key são públicos; a privacidade depende de Auth/RLS. Definições antigas do fornecedor guardadas no navegador deixaram de alterar a ligação da aplicação. As sessões e os perfis de dados existentes mantêm-se separados por projeto/conta e não são apagados.

Com a CLI Supabase já instalada, a alternativa ao SQL Editor é:

```sh
supabase login
supabase link --project-ref TEU_PROJECT_REF
supabase db push
```

A autenticação e a aplicação da migração precisam de ser feitas por alguém com acesso ao projeto. Um URL e uma chave pública permitem usar a aplicação; não permitem criar tabelas, configurar Auth ou publicar funções.

## Migrar os dados que já tinhas

**Primeiro exporta um backup JSON no navegador com os dados mais completos. Não limpes os dados do site.**

1. Inicia sessão numa conta FoodStock vazia.
2. Em **Dados**, escolhe **Migrar dados deste navegador**. A aplicação mostra o número de alimentos e compras antes de confirmar.
3. Em alternativa, usa **Importar backup JSON**. São aceites os backups do navegador e os exports antigos da API Java (`/api/export`). Os backups do navegador contêm a projeção com as alterações ainda por enviar; não é preciso voltar a reproduzir a fila antiga.
4. A importação grava o **stock atual**, o histórico, os movimentos e a lista numa transação. Não volta a somar as compras ao stock e não substitui uma conta que já contenha dados.
5. Se a resposta se perder, usa **Retomar importação pendente**. O mesmo identificador garante que não importa duas vezes.
6. Nos outros dispositivos, inicia sessão na mesma conta para receber os dados. **Não importes de novo cada navegador**: podem conter cópias sobrepostas.

A cópia anterior deste navegador mantém-se separada, na chave `primary` do IndexedDB. Terminar sessão volta a essa cópia; não mistura dados entre contas. Os rascunhos anteriores mantêm-se nessa cópia original: conclui-os antes da migração ou retoma-os aí. Cada conta/projeto usa um perfil local separado. Os ficheiros H2 antigos continuam intactos; a aplicação nova não os lê diretamente. As instruções para exportar a API antiga estão em [backend/README.md](backend/README.md).

## Fotografia da despensa: visão clássica local

O programa compara imagens com um catálogo de **embalagens cadastradas**. Não interpreta alimentos desconhecidos como um modelo de IA. O nome, a categoria, a unidade e a marca opcional são fornecidos por ti ao cadastrar a referência.

### Cadastrar referências

1. Em **Despensa → Referências visuais**, associa um alimento existente ou preenche os dados de uma nova referência. Cadastrar uma referência não cria stock, compras ou gastos.
2. Escolhe uma foto nítida da frente da embalagem. Cadastra uma embalagem de cada vez e evita reflexos, dobras e objetos à frente.
3. Podes arrastar sobre a foto para selecionar apenas a frente; **Usar imagem completa** mantém toda a foto como referência. Recorta uma área com pelo menos 64 × 64 píxeis, contendo texto/desenhos.
4. Guarda a referência. Imagens uniformes ou com poucos pontos distinguíveis são rejeitadas. Podes cadastrar mais de uma vista da mesma embalagem, até 24 referências neste navegador/conta.
5. O catálogo (metadados, padrões visuais e miniaturas) fica no IndexedDB, separado por conta. Para o usar no Mac, no telemóvel ou noutra conta, usa **Exportar referências** e **Importar referências JSON**. A importação não altera o stock. Não há envio automático de fotos ou referências para a base.

### Identificar uma fotografia

1. Escolhe uma imagem ou tira uma foto em **Identificar alimentos por fotografia**. JPEG, PNG e WebP são suportados; se o navegador não abrir HEIC, converte-o para JPEG.
2. Toca em **Analisar neste dispositivo**. Funciona sem sessão e sem Internet depois do primeiro acesso, incluindo os ficheiros do worker em cache. Não há pedidos a fornecedores de visão, chaves de IA ou custo por chamada de reconhecimento.
3. O motor compara os detalhes visuais cadastrados, verifica a geometria e marca as correspondências na foto. O processamento corre num Web Worker para manter a interface utilizável; podes cancelar a análise.
4. Revê os nomes, categorias e quantidades. A contagem indica apenas as embalagens com correspondência encontrada: pode haver objetos ocultos ou não identificados. Nunca é convertida automaticamente em kg/litros. Remove erros e adiciona os itens em falta manualmente.
5. Confirma a **quantidade total que tens em casa**, na unidade do alimento. Para alimentos existentes, o valor substitui o stock anterior. Uma contagem não é uma compra, não inventa preços e não cria gastos. Usa Compras/Finalizar compras para registar despesas.
6. Marca a revisão e guarda. O rascunho e a contagem são persistidos no navegador; o stock confirmado sincroniza com a tua conta quando houver rede. Conflitos com alterações feitas noutro dispositivo mantêm-se para resolução.

A fotografia da despensa e os metadados originais não são guardados nem enviados. As miniaturas das referências são geradas por canvas e ficam localmente com o catálogo; o backup do navegador inclui esse catálogo no perfil. O export específico de referências permite transportá-lo entre dispositivos. Limpar os dados do site remove as referências locais, por isso exporta-as antes.

### Como funciona e quais são os limites

O código próprio em [docs/vision-engine.mjs](docs/vision-engine.mjs) implementa pontos FAST, orientação pelo centroide de intensidade, descritores binários rotacionados, distância de Hamming e verificação geométrica RANSAC/homografia. Não contém pesos treinados, redes neuronais, OCR, dependências de visão externas nem chamadas de rede. São implementações de técnicas clássicas conhecidas, não algoritmos científicos inventados para este projeto.

O reconhecimento é adequado sobretudo a frentes de embalagens com letras/logótipos/desenhos distintos. Embalagens novas precisam de uma referência; trocar a embalagem, esconder o rótulo, reflexos, desfocagem ou perspetivas fortes podem impedir a correspondência. Fruta solta e embalagens lisas/visualmente iguais não são identificadas de forma genérica. Referências de identidades diferentes que tenham correspondências muito semelhantes na mesma região são rejeitadas como ambíguas. O programa não deduz massa, conteúdo restante, marcas ilegíveis ou itens ocultos. A revisão humana continua obrigatória.

Os testes incluem uma referência fotografada noutro ângulo, luminosidade alterada, cópias separadas, imagens desconhecidas e padrões ambíguos. O teste do navegador executa o worker real com rótulos sintéticos cadastrados, inteiramente offline. Isto demonstra os mecanismos de correspondência, não uma precisão garantida para todas as despensas. Nenhuma fotografia pessoal foi usada como fixture.

A antiga integração de visão paga foi removida do código e da aplicação. O esquema SQL histórico pode conter uma tabela/função de quota antiga, que esta versão não utiliza; **não é preciso voltar a executar a migração** para ativar a visão local. Se chegaste a publicar a função antiga no teu projeto, podes removê-la com a CLI autenticada:

```sh
supabase functions delete recognize-food
```

A aplicação atual nunca a chama. Não é necessário configurar funções de visão nem secrets de fornecedores.

## Compras, estatísticas e modo offline

- A lista é um plano. Marcar uma caixa coloca o item no carrinho, sem mexer no stock ou nos gastos. **Finalizar compras** permite confirmar quantidades/unidades, totais pagos, loja e data. Uma confirmação cria/reutiliza alimentos, grava compras e desmarca os itens numa única operação.
- Stock inicial e contagens por fotografia não são despesas. As estatísticas usam apenas compras com quantidade e preço reais. Mantém as unidades consistentes: duas embalagens de 500 g = 1 kg, pelo total pago pelas duas.
- Gastos mensais/anuais incluem as quantidades e o tipo de produtos comprados; a variação não mede inflação. Meses sem compras contam como zero; uma base zero não produz percentagem de comparação.
- O histórico de preços compara o mesmo alimento/unidade, e o “melhor preço” é o menor registado, não uma cotação atual. Cria produtos separados se quiseres comparar marcas/qualidades separadamente.
- IndexedDB guarda uma base confirmada e a fila antes de confirmar o sucesso no ecrã. O Postgres aplica cada operação numa transação e guarda um recibo. A fila só remove uma operação quando o snapshot confirma esse recibo. Um reenvio ou resposta perdida não duplica o stock.
- A aplicação tenta sincronizar ao abrir, ao voltar ao separador, ao recuperar rede e a cada 15 segundos enquanto está visível. Não pode sincronizar com a página fechada. Sessões expiradas são renovadas; se for necessário novo login, a fila não é descartada nem marcada como permanentemente inválida.
- Os dados pertencem à conta, com **Row Level Security** em todas as tabelas. A chave pública sozinha não dá acesso. As mutações passam por RPCs autenticadas; o cliente não pode atualizar diretamente tabelas e contornar os recibos/validações.
- O service worker guarda apenas a interface/fontes, não respostas autenticadas nem imagens. Para atualizar uma versão já aberta, fecha os separadores antigos e abre de novo. Na primeira visita é necessária Internet.
- Limpar os dados do site ou remover armazenamento pode apagar a cópia local e operações por enviar. **Exporta backups antes disso.** O backup não inclui tokens da sessão nem a chave de IA.

## Desenvolvimento e testes

Sem Java, basta servir `docs/`:

```sh
python3 -m http.server 4173 --directory docs
```

Abre `http://localhost:4173`. Podes usar a cópia local offline; a sincronização usa o projeto definido em `docs/config.mjs` e a tua conta FoodStock. Não há campos para configurar o fornecedor na aplicação.

```sh
npm ci
npm test
FOODSTOCK_BROWSER=/usr/bin/chromium npm run test:browser
```

No macOS, `FOODSTOCK_BROWSER` pode apontar para `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`.

Os testes executam o modelo offline, a migração/RPCs/RLS em PostgreSQL local via PGlite e o motor de visão local com fotografias públicas de teste e imagens sintéticas. O teste Chromium usa um perfil e uma base temporários: verifica migração, autenticação, renovação de sessão, isolamento entre contas, fila/reinício/reenvio, confirmação de compras, revisão de fotografia e sete larguras de ecrã. Não usa fotos pessoais ou fornecedores de IA; não garante precisão para imagens arbitrárias nem substitui uma verificação final num projeto Supabase real.

O GitHub Actions executa os testes e checks; o workflow Pages publica exclusivamente `docs/`. `backend/` permanece apenas para migração/exportação da versão antiga, fora da aplicação ativa.


## Publicar atualizações da interface

Antes de publicar alterações ao front-end, executa `npm run release:client -- NOVA_REVISAO` (por exemplo `20261103.1`). O script mantém a mesma revisão no HTML, no grafo completo de módulos, nos estilos e no service worker. Assim, um navegador com ficheiros antigos em cache não os mistura com o HTML de uma versão nova.

O carregador inicial regista a atualização offline mesmo quando um módulo falha. Em caso de erro ou demora excessiva, aparece **Recarregar interface** em vez de ficar indefinidamente em “A abrir os dados”. Essa ação remove apenas caches `foodstock-shell-*` e o service worker desta aplicação; preserva IndexedDB, sessões, stock, compras, rascunhos e fila pendente. A página recarrega para obter os ficheiros atuais. Não uses “Limpar dados do site” para resolver uma atualização.

O teste de atualização reproduz uma cache v5 anterior à migração, passa para o HTML atual e verifica abertura de Dados, conta FoodStock sem campos técnicos e preservação do stock/fila/rascunho. Também simula um módulo indisponível e verifica a recuperação sem apagar dados ou caches de outras aplicações.
