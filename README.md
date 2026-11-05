# FoodStock Manager

Despensa, lista de compras, gastos e preços. Front-end estático no **GitHub Pages**, dados privados em **Supabase/PostgreSQL**, com **Supabase Auth**. O Mac já não precisa de executar uma API Java nem de ficar ligado para o telemóvel sincronizar.

Site: **https://andreleal-l2.github.io/FoodStock-Manager/**

A aplicação funciona offline com IndexedDB e uma fila persistente. O projeto Supabase do FoodStock já está definido em `docs/config.mjs`, com o URL e a chave pública fornecidos pelo responsável. A aplicação mostra apenas a conta FoodStock (email/palavra-passe); não pede configuração do fornecedor aos utilizadores. Credenciais administrativas ficam fora do site. A identificação por fotografia usa um modelo visual aberto, executado no dispositivo, sem cadastro de referências, OpenAI ou API paga de reconhecimento. Na primeira utilização é necessário descarregar o modelo; a revisão humana continua obrigatória.

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

## Identificação automática por fotografia

Em **Despensa**, escolhe ou tira uma fotografia e toca em **Identificar produtos**. Não é necessário cadastrar imagens de referência, marcas ou alimentos antes de analisar. O modelo visual é **Grounding DINO Tiny**, convertido para ONNX em [onnx-community/grounding-dino-tiny-ONNX](https://huggingface.co/onnx-community/grounding-dino-tiny-ONNX), executado por Transformers.js/ONNX Runtime Web.

### Primeira utilização e privacidade

- A primeira análise descarrega os ficheiros públicos do modelo e o runtime. O download pode ter centenas de MB e demorar vários minutos; usa Wi-Fi. Há progresso e cancelamento na interface.
- Só são feitos pedidos de ficheiros/metadados públicos. A fotografia é descodificada no navegador e enviada como píxeis para um Web Worker local; não é enviada ao Hugging Face, Supabase, OpenAI ou outro serviço de reconhecimento.
- A primeira revisão do modelo é fixada a um commit imutável do repositório público. Configuração, tokenizer e pesos usam essa mesma revisão, evitando misturar versões. A revisão e os ficheiros ficam na cache `foodstock-ai-model-v1`.
- O vocabulário é analisado em grupos curtos por categoria, para reduzir interferência entre nomes; a interface mostra o progresso. O modelo preparado é reutilizado entre grupos e entre fotos. Aceleração WebGPU é tentada quando disponível; falhas de inicialização/operações gráficas usam o processador via WASM. O runtime usa uma thread para funcionar no GitHub Pages sem cabeçalhos COOP/COEP.
- O desempenho e a memória dependem do dispositivo. Navegadores que reportem menos de 4 GB não iniciam o modelo; recomenda-se experimentar no Mac. Falta de memória, suporte do navegador ou download incompleto podem impedir a análise. O stock/manual mantém-se disponível.
- Depois de o download/cache terminar, a reabertura e o reconhecimento podem funcionar sem rede. Uma cache parcial, removida ou indisponível precisa de Internet novamente. O navegador pode remover ficheiros por pressão de armazenamento.
- **Libertar espaço do modelo** termina o worker e remove apenas os ficheiros públicos desse modelo. Mantém alimentos, compras, sessão, rascunhos e alterações por enviar. O próximo reconhecimento volta a descarregar o modelo.

### Rever e guardar

1. O modelo procura alimentos comuns usando o vocabulário interno em `food-labels.mjs`. Não pede referências pessoais. Uma identificação continua a ser uma sugestão: embalagens fechadas, rótulos pouco visíveis, produtos fora do vocabulário, sobreposição e desfocagem podem produzir erros ou omissões.
2. As caixas sugeridas são marcadas na foto. As categorias vêm da correspondência com os nomes de alimentos; marcas ilegíveis não são inventadas. A contagem é apenas de objetos/embalagens detetados, não de kg/litros, conteúdo restante ou peças ocultas.
3. Revê os nomes/categorias, associa a um alimento existente ou cria outro, remove erros e adiciona o que falta. Peso/volume/preço não são inferidos. **Adicionar manualmente** funciona mesmo sem modelo ou foto.
4. Confirma a **quantidade total em casa**. Para um alimento existente, substitui o stock anterior. A confirmação não cria despesas; compras/preços continuam em Compras/Finalizar compras.
5. A revisão e a confirmação são guardadas no navegador; o stock confirmado sincroniza com a conta. Uma contagem em conflito com alterações noutro dispositivo continua preservada para resolução.

O sistema anterior de referências deixou de fazer parte da interface. Os dados antigos, se existirem no perfil local, não são apagados e continuam no backup JSON. Não é necessária nova migração SQL nem nenhuma chave de IA/Edge Function de visão.

### Código, distribuição e validação

O modelo é de terceiros e pré-treinado; o projeto não alega tê-lo treinado ou inventado. O runtime Transformers.js (Apache 2.0) e ONNX Runtime Web (MIT) são construídos a partir de dependências fixadas no lockfile, com licenças no diretório gerado `docs/vendor/vision-4.3.2/`. Os pesos são obtidos do repositório público do modelo, com a licença/fonte indicadas na respetiva página.

```sh
ONNXRUNTIME_NODE_INSTALL=skip npm ci
npm run build:vision
npm test
FOODSTOCK_BROWSER=/usr/bin/chromium npm run test:browser
# Integração com pesos reais: usa Internet e pode descarregar centenas de MB.
FOODSTOCK_BROWSER=/usr/bin/chromium npm run test:vision:real
```

`ONNXRUNTIME_NODE_INSTALL=skip` é a opção suportada pelo pacote para não descarregar componentes nativos/CUDA desnecessários. A aplicação usa o runtime do navegador; não desativa a verificação de integridade npm nem TLS. `docs/vendor/` é gerado e ignorado pelo Git. O workflow Pages executa o build antes de publicar.

As validações distinguem domínio/privacidade/cancelamento, UI com fronteira do modelo simulada, runtime Web/WASM real com um grafo ONNX pequeno e integração com pesos reais numa fotografia pública de fruta, sem referências. O teste real também verifica reabertura offline e que só pedidos públicos de ficheiros/metadados saem do navegador. As fotos de teste não são pessoais nem dados de treino, e não demonstram precisão para todas as despensas. Na validação atual, o modelo identificou banana e também sugeriu sal incorretamente na mesma fotografia. É uma versão experimental; ainda não foi medida a precisão com embalagens de arroz/feijão nem em dispositivos móveis físicos. A revisão humana é obrigatória.

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
