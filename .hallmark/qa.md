# FoodStock: revisão Hallmark

Redesign completo das cinco vistas da aplicação, com o tema Furrow. O utilizador escolheu um tom editorial e acolhedor, como um caderno de compras. Skill oficial: [Nutlope/hallmark](https://github.com/Nutlope/hallmark/blob/4f6a46c6dc325d40ab268c93e25c7b96676ebccd/skills/hallmark/SKILL.md), versão 2.0.0.

## Resultado

- Validação estática e no Chromium pela ferramenta oficial `sloplint.mjs`, scope `app`, nas cinco vistas: **0 FAIL, 0 REFLEX**.
- 25 capturas oficiais: desktop 1280, 1440 e 1920, página completa a 1440 e telemóvel a 375 para cada vista. As medições incluem larguras de 320, 375, 414, 768, 1024, 1280 e 1920px.
- Preservação: 5/5 destinos, 13/13 campos e 2/2 hooks de script. O título promocional eliminado está declarado no stamp do CSS.
- Um aviso esperado do kept-check: a hora `13:31` do estado da API no registo original é dinâmica e mudou na nova captura. Não é uma estatística de compras removida.
- Os 7 testes Java existentes passaram, sem falhas, erros ou testes ignorados. Build Maven e sintaxe JavaScript passaram.
- O fluxo no Chromium passou: criar produto, escapar texto HTML, comprar duas quantidades, comparar preço por kg, consumir e exportar JSON. Foi usada uma API separada, em memória, na porta 8081; a base real da porta 8080 não recebeu dados de teste.

## Revisão visual independente

O revisor pediu três correções, todas aplicadas:

1. Preservar a tabela mensal compacta no telemóvel, evitando 36 linhas de rótulos.
2. Corrigir a orientação do estado vazio da despensa: o formulário agora está abaixo.
3. Limpar o feedback de sucesso ao mudar de vista, evitando mensagens de consumo noutros ecrãs.

A confirmação das correções foi feita pelo agente principal, com nova renderização oficial e verificação no navegador. Não foi alegada uma segunda aprovação independente.

## Alterações de texto e apresentação

- `MENOS DESPERDÍCIO. MAIS CONTROLO.` passou a sentence case, sem letras espaçadas (gate 67).
- `Preços e oportunidades` passou a `Preços e lojas`, para caber na navegação mantida (49a).
- `Conhece a tua despensa. Entende as tuas compras.` foi integrado no título existente `O teu ano em números` (54 e 69).
- As linhas decorativas `A TUA CASA, MAIS ORGANIZADA`, `UM POUCO DE PLANEAMENTO VAI LONGE` e `Do supermercado até à última porção, tudo no seu lugar.` foram retiradas (54 e 69).
- `Atualizar dados ↻` passou a `Atualizar dados`. Os símbolos de navegação foram substituídos por um único conjunto de ícones SVG acessíveis.
- O estado da API mantém endereço e hora, em frase simples, sem pontos decorativos nem separadores repetidos. Loja e data aparecem em linhas separadas nas tabelas de preços.
- O estado vazio `Adiciona o primeiro produto acima` passou a `Adiciona o primeiro produto abaixo`, acompanhando a nova ordem da vista.
- Texto sobre armazenamento, exportação, acesso local e limitações da aplicação preservado.

## Ficheiros e material

- Interface: `docs/index.html`, `docs/style.css`, `docs/app.js`.
- Sistema partilhado: `docs/tokens.css`, `docs/base.css`, `design.md`.
- Fontes locais e respetivas licenças OFL: `docs/fonts/`.
- [Comparação antes/depois](compare.html), gerada pela Hallmark. Capturas e registos originais são ignorados pelo Git.
- Não foram usadas fotografias, imagens de substituição ou números inventados. As capturas preenchidas usam dados de teste isolados. A interface real começa com a base existente.
- Nenhum ficheiro do backend ou teste do repositório foi alterado neste redesign.
- O site ainda não foi publicado. A ligação GitHub Pages/API no macOS continua a exigir validação após publicação, conforme o README.
