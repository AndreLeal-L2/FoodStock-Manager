# FoodStock: revisão mobile e offline

Nota: as secções iniciais registam validações históricas da API Java. O estado atual usa Supabase; ver a atualização no fim deste documento.

A pedido do utilizador: redesenho Hallmark, fundo escuro com azul/cinzento, prioridade ao telemóvel e dados guardados no navegador, com envio posterior para a API. Skill oficial: [Nutlope/hallmark 2.0.0](https://github.com/Nutlope/hallmark/blob/4f6a46c6dc325d40ab268c93e25c7b96676ebccd/skills/hallmark/SKILL.md).

## Design

Tema **Console**, sorteado 2/3, com azul a substituir âmbar por escolha explícita do utilizador. O sistema Furrow anterior foi substituído em `design.md` por esta instrução. Fontes locais Host Grotesk e Atkinson Hyperlegible Mono, respetivamente para leitura e medições; licenças OFL em `docs/fonts/`. Sem fotografias, imagens de substituição ou números inventados. Capturas preenchidas usam apenas uma base de teste isolada.

- Hallmark estático e render: **0 FAIL, 0 REFLEX** nas seis vistas.
- 30 capturas oficiais: 1280, 1440 e 1920px, página completa a 1440 e a 375px por vista. O checker também mede outras larguras, de 320 a 1920px.
- Preservação: **6/6 destinos, 54/54 campos, 3/3 hooks, 23/23 títulos**.
- Aviso esperado: o relógio da API na captura original mudou. Não representa remoção de dados de compras.
- [Comparação antes/depois](compare.html), gerada pela ferramenta. Capturas e baseline são ignorados pelo Git.

Revisão independente pediu dois ajustes: reduzir a altura inicial da lista e incluir a tipografia de medições do Console. Aplicados: ajuda em disclosure, Editar ao lado do item com alvo de 44px e Atkinson Mono em valores, quantidades e datas. Um editor recolhido que podia exceder a largura móvel foi corrigido na confirmação mecânica. A verificação final foi feita pelo agente principal após as alterações; não foi alegada uma segunda aprovação independente.

As legendas curtas da navegação inferior mantêm destinos e títulos de página completos. Cada ligação tem também um `title` descritivo. As confirmações distinguem guardar no navegador de sincronizar com a API.

## Dados e sincronização

- IndexedDB grava base confirmada e fila numa transação antes de confirmar cada alteração; escrita solicita durabilidade estrita.
- Identificador estável por operação, recibo persistente na API, transação por aplicação e snapshot consistente.
- A fila só é removida depois de um snapshot reconhecer o recibo. Resposta perdida não duplica a compra.
- Notas em conflito e consumo impossível não são apagados; a alteração fica pendente para resolução explícita.
- Identidade da base impede que outra API substitua silenciosamente a cópia local.
- Web Locks coordena separadores quando disponível; recibos continuam a proteger contra duplicados quando houver entregas simultâneas.
- Rascunhos e foco dos campos são mantidos durante atualizações da lista, incluindo a passagem de identificadores offline para os identificadores da API.
- Service worker guarda a interface/fontes, sem guardar respostas da API. Dados, cálculos e exportação JSON funcionam com API desligada.

## Validação

- **18 testes Java** passaram, sem falhas, erros ou ignorados: funcionalidades anteriores e protocolo de sincronização, recibos, repetição concorrente, conflitos, validação, identidade da base e compatibilidade da lista antiga.
- **6 testes de domínio local** executados diretamente por `npm test`: projeção offline, preços normalizados, comparação mensal/anual, valores decimais, conflitos e correspondência entre templates Java/browser.
- Suite de navegador reproduzível: `npm run test:browser` (requer JDK, JAR compilado e Chromium). Usa servidor estático, perfil Chrome e base H2 temporários.
- Verificados: criação de alimentos/compras/consumo com API desligada, edição da lista, exportação offline, reload sem Internet, navegador fechado/reaberto, API ligada posteriormente e envio pelo temporizador sem clique, resposta perdida depois de gravar, consumo em conflito, dois separadores, falha de quota sem falsa confirmação, reinício da API e sete larguras de 320 a 1920px.
- Dados reais da API principal não foram usados como fixtures nem reinicializados.

## Limites práticos

O primeiro acesso precisa dos ficheiros da interface. Uma página fechada/suspensa não pode garantir pedidos contínuos: a fila persiste e a tentativa retoma ao abrir/voltar. Apagar dados do site apaga a cópia desse navegador; o backup JSON inclui pendências, mas ainda não tem importador automático.

Para sincronizar no telemóvel com a API no Mac, é preciso um endereço HTTPS alcançável pelo telefone. O README descreve Tailscale Serve privado. Essa configuração e as permissões reais de Safari/iOS dependem dos dispositivos do utilizador; aqui foi validado o fluxo no Chromium com API local. A API instalada no Mac precisa de ser atualizada para o novo protocolo.

## Atualização: Finalizar compras

A lista passou a permitir confirmar os itens marcados num único formulário com loja, data, alimento existente/novo, unidade, quantidade real e total pago por item. Quantidades ambíguas e preços não são presumidos. O rascunho é guardado no navegador e pode ser retomado. Só a confirmação cria entradas no stock e nas despesas; os itens confirmados ficam desmarcados para a próxima compra.

A confirmação é uma operação `CHECKOUT` indivisível na projeção local e na transação da API, com o recibo idempotente já existente. Não há registos parciais se falhar uma linha. Uma segunda finalização dos mesmos itens já desmarcados é rejeitada; um reenvio do mesmo identificador devolve o recibo anterior. Uma API antiga que ainda não conheça `CHECKOUT` deixa a operação pendente para nova tentativa, sem a apagar.

Validação desta atualização: 22 testes Java e 10 testes de modelo local aprovados. A suite de navegador cobre rascunho após reload, preços obrigatórios, criação/reutilização de alimentos, confirmação dupla offline, API antiga, resposta perdida após gravar todo o conjunto e atualização das estatísticas sem duplicação. Foi corrigido um evento de campo que podia ocorrer ao fechar o formulário já guardado; o teste mantém a exigência de zero erros JavaScript. Os testes usam bases temporárias e não alteram os dados reais.


## Atualização: Supabase e revisão de fotografia

A aplicação ativa deixou de chamar Java/localhost. Usa Supabase Auth e RPCs Postgres autenticadas, com RLS por conta nas sete tabelas públicas. A API Java permanece só como ferramenta de exportação/migração. As cópias IndexedDB são separadas por projeto e utilizador; sair ou trocar de conta não mistura os dados. Importação de uma projeção antiga é explícita, atómica, idempotente e apenas para contas vazias, preservando stock e histórico sem somar de novo as compras.

A fotografia vive na Despensa. A interface permite câmara/ficheiro, compressão local, análise online e revisão persistente dos nomes, categorias, marca opcional e quantidade total em casa. Contagens de embalagens não viram kg/litros. O stock só muda após a confirmação obrigatória; uma contagem substitui o valor anterior e não produz despesas. Alterações concorrentes de stock são detetadas. Imagens não entram no IndexedDB, service worker ou base. A função exige sessão válida, origem permitida, imagem válida/tamanho limitado e quota persistente antes de chamar o fornecedor; a chave privada fica em secrets da função.

Validação: 22 testes automatizados (11 de domínio, 5 PostgreSQL/RLS/RPC, 3 do handler de visão, 3 de autenticação). Chromium com perfil e PostgreSQL temporários cobre migração, checkout offline, interface totalmente sem rede, reinício do browser, rascunho de foto após reload, revisão obrigatória, sete larguras 320–1440px, resposta perdida depois da gravação, isolamento/renovação de sessão, falha de armazenamento e dois separadores; zero erros JavaScript. Captura de teste `shots/supabase-photo-mobile.png` revista visualmente. A estética Console e os seis destinos foram preservados; não se voltou a executar a skill Hallmark neste incremento funcional.

Limite de validação: não foi criado nem configurado um projeto Supabase real nesta sessão e não foi chamada a API OpenAI. O reconhecimento nos testes usa respostas simuladas e não comprova precisão. O projeto, a migração remota, Auth e a Edge Function/secrets precisam de configuração por alguém com acesso. O README contém os passos; nenhum segredo foi colocado no front-end.


## Atualização: ligação fixa e arranque após atualização

O URL e a chave pública fornecidos pelo responsável foram definidos em `docs/config.mjs`. A interface Dados mostra apenas a conta FoodStock com email/palavra-passe, sessão, migração e sincronização. Não há campos de URL, chave ou configuração do fornecedor; preferências antigas do navegador deixam de redirecionar a ligação. Sessões e perfis existentes permanecem guardados.

Foi reproduzido o bloqueio com HTML novo e JavaScript sem revisão servido pela cache v5: `Cannot set properties of null (setting 'value')`, deixando o estado “A abrir os dados” e a vista Dados escondida. O HTML, CSS, módulos e shell offline passaram a usar a mesma revisão, mantida por `scripts/release-client.mjs`. O carregador independente regista a atualização do service worker mesmo em falhas de módulos e mostra recuperação em vez de um arranque infinito. Recarregar interface remove apenas o worker da aplicação e caches de ficheiros `foodstock-shell-*`; preserva IndexedDB, sessões e caches de outras aplicações.

Validação: 23 testes unitários/PostgreSQL/visão/autenticação aprovados, incluindo preservação da sessão e rejeição de configurações antigas do fornecedor. O Chromium validou os cenários offline existentes com login sem campos técnicos, a passagem de uma cache v5 para a nova interface, preservação de stock/fila/rascunho, módulo indisponível e recuperação sem apagar dados. Os controlos da conta foram medidos a 320/390/1440px e as capturas mobile/desktop guardadas em `shots/account-*.png`. O responsável confirmou a execução anterior das tabelas no SQL Editor; esta atualização não altera o esquema nem solicita repetir a migração. Não foi iniciado login numa conta pessoal do utilizador nem alterada a configuração administrativa remota do projeto.


## Atualização: visão computacional própria sem IA

Por escolha explícita do utilizador, foi removida a integração OpenAI/Edge Function. O motor próprio em `vision-engine.mjs` usa FAST, orientação pelo centroide, descritores binários rotacionados, Hamming e RANSAC/homografia. Não há modelos treinados, dependência de OpenCV em runtime, OCR ou chamadas a fornecedores de reconhecimento. Um worker mantém o cálculo fora da interface e permite cancelar. Os nomes/categorias/marcas vêm de referências cadastradas; a tecnologia não faz identificação semântica genérica.

A Despensa ganhou cadastro/recorte de referências, miniaturas, remoção e exportação/importação de catálogo. Até 24 referências, separadas por perfil IndexedDB. O catálogo não sincroniza automaticamente: a transferência para outro dispositivo é explícita por JSON. A fotografia da despensa é transitória e não é enviada a serviços externos. A revisão continua obrigatória, a contagem não inventa kg/litros e a confirmação substitui o stock anterior sem criar despesas. O esquema Supabase existente permanece compatível e não exige repetir SQL; a quota histórica deixou de ser usada.

Validação: 29 testes de domínio/PostgreSQL/autenticação/visão. O motor local foi testado com fotografias públicas de um objeto planar em ângulo diferente, luminosidade alterada, rotação de 90 graus, duas cópias separadas, ruído/imagem uniforme e padrões ambíguos. Imagens de OpenCV usadas apenas como fixtures, com licença/atribuição em `tests/fixtures`; não são dados de treino nem prova de precisão em todas as embalagens. O navegador executou o worker real com dois rótulos sintéticos cadastrados, completamente offline, sem mocks de reconhecimento. Verificou referência sem detalhes rejeitada, persistência após reload, catálogo exportado/importado, isolamento entre contas, revisão obrigatória, ausência de pedidos OpenAI/funções de visão, sete larguras de ecrã e sincronização do stock sem duplicar despesas. Captura da correspondência visual: `shots/local-vision-matches.png`.

Limites: rótulos partilhados, embalagens lisas, oclusão, reflexos, desfocagem e vistas muito diferentes podem impedir ou confundir correspondências. Itens desconhecidos não recebem uma classificação inventada; o utilizador revê e adiciona os que faltam. Não foi feita uma medição de precisão numa despensa real do utilizador. O módulo implementa algoritmos clássicos conhecidos; não se alega ter inventado esses algoritmos.


## Atualização: identificação automática sem referências

Após confirmação do utilizador, o catálogo de imagens pessoais foi substituído por um modelo aberto pré-treinado, executado no navegador. Não há chamadas OpenAI nem inferência paga. A fotografia é processada num worker; apenas ficheiros públicos do modelo são descarregados. O primeiro download fica fixo a uma revisão imutável e guardado separadamente da cache da interface. A interface explica os requisitos de espaço, memória e primeiro download, permite cancelar e adicionar manualmente, e mantém revisão obrigatória antes de alterar stock. A contagem de objetos visíveis continua sem inventar massa ou volume. O SQL não muda; referências antigas já guardadas não são apagadas silenciosamente.

Validação local: 30 testes de domínio/PostgreSQL/autenticação/visão aprovados, verificação de sintaxe, build do runtime, suite offline e atualização da cache aprovados. A suite da interface usa uma simulação explicitamente identificada; não comprova precisão. Um teste separado executou o runtime ONNX/WASM distribuído, sem COOP/COEP, com um grafo Add real. O teste adicional de integração descarrega o modelo público, identifica uma fotografia pública de fruta sem referências e repete após reload offline, verificando ausência de upload de imagens. A integração com os pesos reais passou no GitHub Actions (https://github.com/AndreLeal-L2/FoodStock-Manager/actions/runs/41941396585), usando WASM numa thread, sem COOP/COEP, a fotografia pública de fruta e um reload offline com novo worker. O ambiente local continua a bloquear Hugging Face; essa validação completa foi executada no CI, enquanto o runtime/contratos/UI foram verificados também localmente. O teste completo demorou 5m22s incluindo setup, download e ambas as análises; não é uma medição isolada da latência de reconhecimento.

Qualidade observada: o modelo sugeriu Bananas (presente) e Sal (falso positivo), omitiu outros alimentos e gerou palavras incompletas que foram rejeitadas. O vocabulário passou a ser analisado em grupos curtos, reutilizando os pesos, depois de uma legenda longa não produzir identificações válidas. Foi corrigida a reabertura offline: o runtime requer modo local/cache e a pesquisa interna de tokenizer ignorava a revisão recebida; também o template de URL ficou fixo ao mesmo commit imutável. O teste mantém a exigência de identificar fruta realmente, repetir offline e não enviar imagens, sem substituir o modelo por mocks. A interface declara o estado experimental e exige revisão. Não há medição de precisão numa despensa real, em embalagens de arroz/feijão ou em telemóvel físico; um viewport mobile não comprova esses resultados. Foram revistas as capturas mobile, incluindo a revisão, sem alterações ao estilo Console.


## Atualização: otimização com Ponytail

Aplicada a skill Ponytail full do repositório DietrichGebert/ponytail, commit `96608e078b2d5ea607c5c3b8b5a54d1c1fba6846`. Foram eliminadas varreduras repetidas do histórico nas estatísticas, reutilizado o formatador nativo de datas e preparada a imagem uma única vez para os nove grupos do modelo. API e formato dos resultados foram preservados. Não foram removidas validações monetárias, confirmação de stock, isolamento de contas, cancelamento ou recuperação offline. Não há novas dependências nem instalação de hooks.

Verificação: 31 testes unitários/PostgreSQL/autenticação/visão, sintaxe e testes Chromium offline/atualização/runtime aprovados. O teste do adaptador verifica a reutilização dos tensores e a separação de fotos; o teste das estatísticas cobre várias lojas/produtos, passagem de ano, meses vazios, preços empatados e ausência de mutações nos dados. Resultados completos foram comparados com `ffa2b4f` em nove anos de dados sintéticos, com medições em PERFORMANCE.md. A integração com pesos reais e reload offline está pendente no CI. A revisão visual anterior permanece aplicável: não houve mudança de layout, cores ou formulários.
