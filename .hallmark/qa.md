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
