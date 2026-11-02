# FoodStock Manager

Despensa, lista de compras, gastos e preços. Front-end estático no **GitHub Pages**, dados privados em **Supabase/PostgreSQL**, com **Supabase Auth**. O Mac já não precisa de executar uma API Java nem de ficar ligado para o telemóvel sincronizar.

Site: **https://andreleal-l2.github.io/FoodStock-Manager/**

A aplicação funciona offline com IndexedDB e uma fila persistente. A ligação real à nuvem requer criar/configurar um projeto Supabase. Este repositório não inclui credenciais nem cria um projeto automaticamente. A identificação por fotografia está implementada como integração opcional; requer uma Edge Function e um fornecedor de visão configurados. Os testes de visão usam respostas simuladas, não demonstram precisão de reconhecimento real.

## Configurar o Supabase

1. Cria um projeto em [Supabase](https://supabase.com/dashboard). Guarda a palavra-passe da base em privado.
2. Abre **SQL Editor**, cria uma query e executa o conteúdo completo de [supabase/migrations/202611020001_foodstock.sql](supabase/migrations/202611020001_foodstock.sql). O ficheiro destina-se a uma instalação nova; para futuras alterações, adiciona migrações, não repitas a inicial sobre tabelas existentes.
3. Em **Authentication → Providers**, ativa Email/Password e a confirmação de email. Em **URL Configuration**, usa `https://andreleal-l2.github.io/FoodStock-Manager/` como Site URL. Cria/confirma a tua conta. Depois de criares as contas necessárias, podes desativar novos registos públicos no Supabase.
4. Em **Project Settings → API** (ou **Connect → API Keys**), copia o **Project URL** e a chave **publishable** ou a antiga **anon**. Não uses `service_role`, `sb_secret_…` nem a palavra-passe da base no site.
5. No FoodStock, abre **Dados → Configurar o projeto**, preenche o URL e a chave pública e guarda. Inicia sessão. Repete no telemóvel usando **o mesmo projeto e a mesma conta**.

Opcionalmente, podes colocar apenas o URL e a chave pública em [docs/config.mjs](docs/config.mjs), para os dispositivos não precisarem de os preencher. São valores públicos; a privacidade depende de Auth/RLS. As definições guardadas num navegador têm prioridade sobre esse ficheiro.

Com a CLI Supabase já instalada, a alternativa ao SQL Editor é:

```sh
supabase login
supabase link --project-ref TEU_PROJECT_REF
supabase db push
```

A autenticação e a aplicação da migração precisam de ser feitas por alguém com acesso ao projeto. Um URL e uma chave pública permitem usar a aplicação; não permitem criar tabelas, configurar Auth ou publicar funções.

## Migrar os dados que já tinhas

**Primeiro exporta um backup JSON no navegador com os dados mais completos. Não limpes os dados do site.**

1. Configura o Supabase e inicia sessão numa conta vazia.
2. Em **Dados**, escolhe **Migrar dados deste navegador**. A aplicação mostra o número de alimentos e compras antes de confirmar.
3. Em alternativa, usa **Importar backup JSON**. São aceites os backups do navegador e os exports antigos da API Java (`/api/export`). Os backups do navegador contêm a projeção com as alterações ainda por enviar; não é preciso voltar a reproduzir a fila antiga.
4. A importação grava o **stock atual**, o histórico, os movimentos e a lista numa transação. Não volta a somar as compras ao stock e não substitui uma conta que já contenha dados.
5. Se a resposta se perder, usa **Retomar importação pendente**. O mesmo identificador garante que não importa duas vezes.
6. Nos outros dispositivos, inicia sessão na mesma conta para receber os dados. **Não importes de novo cada navegador**: podem conter cópias sobrepostas.

A cópia anterior deste navegador mantém-se separada, na chave `primary` do IndexedDB. Terminar sessão volta a essa cópia; não mistura dados entre contas. Os rascunhos anteriores mantêm-se nessa cópia original: conclui-os antes da migração ou retoma-os aí. Cada conta/projeto usa um perfil local separado. Os ficheiros H2 antigos continuam intactos; a aplicação nova não os lê diretamente. As instruções para exportar a API antiga estão em [backend/README.md](backend/README.md).

## Fotografia da despensa

Em **Despensa → Identificar alimentos por fotografia**:

1. Tira uma foto ou escolhe uma imagem. Usa boa luz e mantém as embalagens separadas e os rótulos visíveis. JPEG, PNG e WebP são suportados; se o navegador não conseguir abrir HEIC, converte-o para JPEG.
2. Toca em **Analisar fotografia**. Requer sessão e Internet. A imagem é redimensionada no navegador para até 2048 px e convertida para JPEG antes do envio; os metadados originais não são copiados.
3. Revê os nomes, categorias, marca opcional e quantidades. A contagem de embalagens visíveis é apenas uma sugestão, nunca é tratada automaticamente como kg ou litros. Pesos e volumes desconhecidos ficam por preencher.
4. Associa cada linha a um alimento existente ou cria um novo. Remove falsos positivos e adiciona itens em falta.
5. Confirma a **quantidade total que tens em casa**, na unidade do alimento. Para um alimento existente, o valor **substitui** o stock anterior. Uma foto não é uma compra: não cria gastos nem inventa preços. Se queres registar compras e preços, usa **Finalizar compras** ou **Compras**.
6. Marca a confirmação de revisão e guarda. A contagem é gravada primeiro no navegador, mesmo sem rede. Se outro dispositivo tiver alterado o stock entretanto, a sincronização bloqueia a contagem e preserva-a para resolução, em vez de sobrescrever a alteração silenciosamente.

A foto não é guardada no banco nem num bucket. É enviada à Edge Function e ao fornecedor de visão apenas ao pedir a análise. A política de tratamento/retenção do fornecedor também se aplica. O rascunho com os resultados e as correções fica no navegador; depois de recarregar, podes continuar a revisão offline. A imagem em si não persiste.

### Ativar o reconhecimento com OpenAI

Esta implementação usa uma **Supabase Edge Function**, porque a chave do fornecedor não pode estar no GitHub Pages. O Supabase/PostgreSQL guarda os dados; o serviço de visão reconhece a imagem. Não é necessário manter um servidor teu ligado.

1. Configura uma chave da API OpenAI com acesso a um modelo que suporte imagens e JSON Schema. O padrão é `gpt-4.1-mini`, substituível por `OPENAI_VISION_MODEL`.
2. Na pasta do repositório, com a CLI autenticada e o projeto ligado:

```sh
supabase functions deploy recognize-food
```

3. No Dashboard, em **Edge Functions → Secrets**, define:

| Secret | Valor |
| --- | --- |
| `OPENAI_API_KEY` | A chave privada da OpenAI |
| `ALLOWED_ORIGINS` | `https://andreleal-l2.github.io` (sem o caminho do repositório) |
| `OPENAI_VISION_MODEL` | Opcional; padrão `gpt-4.1-mini` |

`SUPABASE_URL` e `SUPABASE_ANON_KEY` são disponibilizados automaticamente pelo runtime Supabase. A função não precisa de `service_role`. O `verify_jwt = false` em `supabase/config.toml` é intencional para suportar as novas publishable keys: **a função verifica o Bearer token com Supabase Auth antes de analisar ou gastar quota**.

Há um limite persistente de **10 tentativas de análise por conta/dia** na base; pedidos que chegam ao fornecedor contam mesmo se falharem. Configura também limites de orçamento no fornecedor. A imagem tem limite de envio, a resposta é validada e erros não devolvem chaves nem conteúdo bruto do fornecedor. A qualidade depende da fotografia/modelo: objetos sobrepostos, rótulos ilegíveis e embalagens abertas precisam de revisão humana. Marcas ilegíveis ficam vazias.

Para desenvolvimento local, acrescenta o teu `http://localhost:PORTA` a `ALLOWED_ORIGINS`, separado por vírgula. Não precisas de o permitir para usar o site publicado.

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

Abre `http://localhost:4173`. Podes usar a aplicação offline sem projeto configurado. Para testar sincronização real, configura o teu projeto em Dados.

```sh
npm ci
npm test
FOODSTOCK_BROWSER=/usr/bin/chromium npm run test:browser
```

No macOS, `FOODSTOCK_BROWSER` pode apontar para `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`.

Os testes executam o modelo offline, a migração/RPCs/RLS em PostgreSQL local via PGlite e o handler de reconhecimento com fornecedor simulado. O teste Chromium usa um perfil e uma base temporários: verifica migração, autenticação, renovação de sessão, isolamento entre contas, fila/reinício/reenvio, confirmação de compras, revisão de fotografia e sete larguras de ecrã. Não usa fotos pessoais, não chama o fornecedor de IA e não demonstra precisão de visão nem substitui uma verificação final num projeto Supabase real.

O GitHub Actions executa os testes e checks; o workflow Pages publica exclusivamente `docs/`. `backend/` permanece apenas para migração/exportação da versão antiga, fora da aplicação ativa.
