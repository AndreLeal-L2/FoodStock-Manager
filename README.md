# FoodStock Manager

Despensa, lista de compras, gastos e preços. Front-end estático no **GitHub Pages**, dados privados em **Supabase/PostgreSQL**, com **Supabase Auth**. O Mac já não precisa de executar uma API Java nem de ficar ligado para o telemóvel sincronizar.

Site: **https://andreleal-l2.github.io/FoodStock-Manager/**

A aplicação funciona offline com IndexedDB e uma fila persistente. O projeto Supabase do FoodStock já está definido em `docs/config.mjs`, com o URL e a chave pública fornecidos pelo responsável. A aplicação mostra apenas a conta FoodStock (email/palavra-passe); não pede configuração do fornecedor aos utilizadores. Credenciais administrativas ficam fora do site. A identificação por fotografia lê rótulos em português/inglês no dispositivo e oferece pesquisa visual opcional. Não exige referências pessoais nem serviços pagos de inferência; a revisão humana continua obrigatória.

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

## Identificação por fotografia

Na **Despensa**, escolhe ou tira uma fotografia, com os alimentos separados e os rótulos voltados para a câmara. Há duas ações:

- **Ler rótulos**: lê nomes em português/inglês com Tesseract.js 7.0.0 e sugere alimentos como arroz, feijão, polpa de tomate e azeite. Mostra o texto que originou cada sugestão. O primeiro download é de cerca de 8 MB, servido pelo próprio site. Não inicia automaticamente o modelo visual grande, mesmo se não encontrar nomes.
- **Procurar pela aparência**: usa OWLv2 para alimentos sem rótulo legível. A primeira utilização pode descarregar centenas de MB e demorar vários minutos; prefere Wi-Fi e o Mac. Se já tens uma revisão da mesma fotografia, acrescenta sugestões novas e preserva os nomes, marcas, unidades e quantidades corrigidos. Uma fotografia nova exige confirmar a substituição da revisão anterior.

Não é necessário cadastrar referências, marcas ou alimentos antes de analisar. Escolher uma foto mantém o stock inalterado. O original não é enviado para reconhecimento nem guardado na base/cache; apenas as sugestões/revisão ficam no perfil local. As imagens são descodificadas no navegador e processadas em workers. Nem OpenAI nem outros serviços recebem os píxeis. Só saem os pedidos dos ficheiros públicos e a sincronização habitual dos dados confirmados.

### Rever e guardar

1. Confere o nome, a categoria e a origem: **Lido no rótulo** ou **Identificação pela aparência**. Remove erros e adiciona os alimentos em falta. As caixas de rótulos marcam texto, não delimitam embalagens.
2. Associa a um alimento existente ou cria um novo. A marca é opcional. A leitura tenta ignorar ingredientes, informação nutricional e frases como “sem leite”; não garante compreender todas as disposições de uma embalagem.
3. Indica a **quantidade total em casa** e a unidade. O texto “1 kg” não revela quanto resta; rótulos repetidos não são tratados como uma contagem de embalagens. Preço, peso restante e unidades não são inventados.
4. Marca a revisão e confirma **Guardar contagem no stock**. Para um alimento existente, substitui o stock anterior. Não cria despesas; compras e preços continuam em Compras/Finalizar compras.
5. Podes cancelar, retomar o rascunho após reload ou guardar offline. Uma alteração concorrente de stock exige nova revisão. O botão de pesquisa visual só fica disponível com a fotografia aberta; após reload é necessário escolher uma foto novamente.

### Downloads, memória e modo offline

- O OCR usa os modelos abertos de português e inglês, construídos com as dependências e servidos em `docs/vendor/labels-7.0.0/`. O motor é terminado após cada leitura para libertar memória; o modelo visual pode permanecer preparado entre pesquisas.
- O visual usa [Xenova/owlv2-base-patch16-ensemble](https://huggingface.co/Xenova/owlv2-base-patch16-ensemble), revisão fixa `3e255bc9bf304b3358a8c1945c0a9514eefe7f10`, Transformers.js e ONNX Runtime Web. Tokenizer, configuração e pesos são da mesma revisão, incluindo pesquisas internas da biblioteca. Não é necessário consultar a API de metadados para descobrir outra versão.
- A imagem e todos os nomes são analisados numa única passagem pelo modelo. O visual rejeita propostas abaixo de 0,35 e não tenta distinguir pela textura pós como sal/farinha/temperos: nesses casos, precisa do nome no rótulo. A pontuação do modelo não é uma probabilidade calibrada de acerto.
- A identificação visual usa WASM numa thread, compatível com Pages sem COOP/COEP. Navegadores que reportem menos de 4 GB são impedidos de iniciar esse modelo; recomenda-se o Mac/computador. Essa restrição não bloqueia a leitura de rótulos.
- Depois do primeiro download completo, os ficheiros podem ser reutilizados offline. Uma cache parcial, removida pelo navegador, armazenamento indisponível ou falta de memória podem impedir a identificação. O registo manual continua disponível.
- **Libertar espaço dos modelos** termina a análise e remove apenas a cache pública `foodstock-ai-model-v1`. Mantém stock, compras, sessões, rascunhos e alterações por enviar. O próximo uso precisa de descarregar os ficheiros novamente. A cache Tesseract em IndexedDB foi desativada; os ficheiros públicos usam a mesma cache da aplicação.

### Distribuição e validação

Tesseract.js/core são Apache 2.0; os pacotes de idiomas declaram MIT e os dados de treino têm origem em tessdata. OWLv2 é da Google Research, com exportação ONNX de Xenova, sob Apache 2.0. Transformers.js é Apache 2.0 e ONNX Runtime Web é MIT. Licenças e atribuições acompanham os ficheiros gerados. São motores/modelos de terceiros; o projeto não alega tê-los treinado ou inventado. Não são instalados hooks nem enviados dados para treino. Não é necessária nova migração SQL nem nenhuma chave de IA.

```sh
ONNXRUNTIME_NODE_INSTALL=skip npm ci
npm run build:vision
npm test
FOODSTOCK_BROWSER=/usr/bin/chromium npm run test:browser
# Visão com pesos reais: usa Internet e pode descarregar centenas de MB.
FOODSTOCK_BROWSER=/usr/bin/chromium npm run test:vision:real
```

`ONNXRUNTIME_NODE_INSTALL=skip` evita os componentes nativos/CUDA desnecessários; integridade npm e TLS permanecem ativos. O build inclui ambos os motores e os dois idiomas. `docs/vendor/` é gerado, ignorado pelo Git e construído no workflow Pages.

Validação local: 38 testes de domínio/PostgreSQL/autenticação/visão/rótulos e testes de navegador. O OCR/WASM real lê quatro rótulos portugueses sintéticos, repete após reload offline, rejeita exemplos de ingredientes/ausência e abre a revisão real com quantidades obrigatórias, sem pedidos externos. A suite de UI usa motores simulados para verificar cancelamento, adição de sugestões, preservação de correções, limites e sincronização; não demonstra precisão. A visão real tem um teste separado com a fotografia pública de fruta, sem referências, agora exigindo pelo menos dois alimentos presentes, rejeitando alimentos ausentes e verificando uma imagem vazia. A revisão visual passou com pesos reais no [GitHub Actions](https://github.com/AndreLeal-L2/FoodStock-Manager/actions/runs/42034529086): Laranjas, Lima, Limões e Kiwi, sem alimentos ausentes nessa fotografia; a imagem vazia não produziu sugestões e o resultado repetiu-se após reload offline. O ambiente de desenvolvimento bloqueia Hugging Face, pelo que o teste completo dos pesos visuais foi executado no CI; os testes de OCR e da interface correram também localmente.

Continua a ser uma versão experimental. Não há medição de precisão numa despensa real do utilizador nem em telemóveis físicos. Reflexos, texto pequeno ou inclinado, oclusão, ingredientes noutras regiões e produtos fora do vocabulário podem causar erros ou omissões. A revisão é obrigatória e nunca se grava stock só porque foi detetado um nome.

## Compras, estatísticas e modo offline

- A lista é um plano. Marcar uma caixa coloca o item no carrinho, sem mexer no stock ou nos gastos. **Finalizar compras** permite confirmar quantidades/unidades, totais pagos, loja e data. Uma confirmação cria/reutiliza alimentos, grava compras e desmarca os itens numa única operação.
- Stock inicial e contagens por fotografia não são despesas. As estatísticas usam apenas compras com quantidade e preço reais. Mantém as unidades consistentes: duas embalagens de 500 g = 1 kg, pelo total pago pelas duas.
- Gastos mensais/anuais incluem as quantidades e o tipo de produtos comprados; a variação não mede inflação. Meses sem compras contam como zero; uma base zero não produz percentagem de comparação.
- O histórico de preços compara o mesmo alimento/unidade, e o “melhor preço” é o menor registado, não uma cotação atual. Cria produtos separados se quiseres comparar marcas/qualidades separadamente.
- IndexedDB guarda uma base confirmada e a fila antes de confirmar o sucesso no ecrã. O Postgres aplica cada operação numa transação e guarda um recibo. A fila só remove uma operação quando o snapshot confirma esse recibo. Um reenvio ou resposta perdida não duplica o stock.
- A aplicação tenta sincronizar ao abrir, ao voltar ao separador, ao recuperar rede e a cada 15 segundos enquanto está visível. Não pode sincronizar com a página fechada. Sessões expiradas são renovadas; se for necessário novo login, a fila não é descartada nem marcada como permanentemente inválida.
- Os dados pertencem à conta, com **Row Level Security** em todas as tabelas. A chave pública sozinha não dá acesso. As mutações passam por RPCs autenticadas; o cliente não pode atualizar diretamente tabelas e contornar os recibos/validações.
- O service worker guarda a interface/fontes e, depois do primeiro uso, o runtime visual numa cache separada. Os pesos públicos também ficam em cache. Não guarda respostas autenticadas nem imagens. Para atualizar uma versão já aberta, fecha os separadores antigos e abre de novo. Na primeira visita é necessária Internet.
- Limpar os dados do site ou remover armazenamento pode apagar a cópia local e operações por enviar. **Exporta backups antes disso.** O backup não inclui tokens da sessão nem a chave de IA.

## Desenvolvimento e testes

Sem Java, instala as dependências, constrói o runtime e serve `docs/`:

```sh
ONNXRUNTIME_NODE_INSTALL=skip npm ci
npm run build:vision
python3 -m http.server 4173 --directory docs
```

Abre `http://localhost:4173`. Podes usar a cópia local offline; a sincronização usa o projeto definido em `docs/config.mjs` e a tua conta FoodStock. Não há campos para configurar o fornecedor na aplicação.

```sh
ONNXRUNTIME_NODE_INSTALL=skip npm ci
npm run build:vision
npm test
FOODSTOCK_BROWSER=/usr/bin/chromium npm run test:browser
```

No macOS, `FOODSTOCK_BROWSER` pode apontar para `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`.

Os testes executam o modelo offline, a migração/RPCs/RLS em PostgreSQL local via PGlite e o pós-processamento do modelo e o controlo do worker. O runtime real e os pesos reais têm testes de integração separados. O teste Chromium usa um perfil e uma base temporários: verifica migração, autenticação, renovação de sessão, isolamento entre contas, fila/reinício/reenvio, confirmação de compras, revisão de fotografia e sete larguras de ecrã. Não usa fotos pessoais nem serviços de inferência remota; não garante precisão para imagens arbitrárias nem substitui uma verificação final num projeto Supabase real.

O GitHub Actions executa os testes e checks; o workflow Pages publica exclusivamente `docs/`. `backend/` permanece apenas para migração/exportação da versão antiga, fora da aplicação ativa.


## Publicar atualizações da interface

Antes de publicar alterações ao front-end, executa `npm run release:client -- NOVA_REVISAO` (por exemplo `20261103.1`). O script mantém a mesma revisão no HTML, no grafo completo de módulos, nos estilos e no service worker. Assim, um navegador com ficheiros antigos em cache não os mistura com o HTML de uma versão nova.

O carregador inicial regista a atualização offline mesmo quando um módulo falha. Em caso de erro ou demora excessiva, aparece **Recarregar interface** em vez de ficar indefinidamente em “A abrir os dados”. Essa ação remove apenas caches `foodstock-shell-*` e o service worker desta aplicação; preserva IndexedDB, sessões, stock, compras, rascunhos e fila pendente. A página recarrega para obter os ficheiros atuais. Não uses “Limpar dados do site” para resolver uma atualização.

O teste de atualização reproduz uma cache v5 anterior à migração, passa para o HTML atual e verifica abertura de Dados, conta FoodStock sem campos técnicos e preservação do stock/fila/rascunho. Também simula um módulo indisponível e verifica a recuperação sem apagar dados ou caches de outras aplicações.

## Otimização do código

A revisão `20261105.2` aplica o [Ponytail full](https://github.com/DietrichGebert/ponytail/blob/main/skills/ponytail/SKILL.md) às estatísticas, à preparação da fotografia e à formatação de datas. As alterações reutilizam a plataforma e as dependências existentes. Métodos, medições e limites estão em [PERFORMANCE.md](PERFORMANCE.md).
