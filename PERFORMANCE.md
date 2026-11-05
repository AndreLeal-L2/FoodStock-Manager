# Otimizações com Ponytail

Aplicado o [Ponytail full](https://github.com/DietrichGebert/ponytail/blob/96608e078b2d5ea607c5c3b8b5a54d1c1fba6846/skills/ponytail/SKILL.md): reutilizar código existente, eliminar trabalho repetido e manter validações. Não foram adicionadas dependências, instaladores ou hooks.

Comparação com `ffa2b4f`, em Node 24.19.0 no ambiente de desenvolvimento:

| Operação | Antes | Depois | Dados |
| --- | ---: | ---: | --- |
| Calcular estatísticas | 44,11 ms | 1,64 ms | 300 alimentos, 12 000 compras fictícias |
| Formatar datas | 163,61 ms | 1,79 ms | 2 000 datas fictícias |
| Preparar os píxeis da fotografia | 9 execuções | 1 execução | Reutilização entre as nove categorias |

Tempos: mediana de nove amostras após aquecimento. As saídas completas das estatísticas foram comparadas com a implementação anterior para os anos 2019–2027; as datas formatadas também são iguais. O histórico é organizado uma vez por mês e alimento; totais monetários continuam em cêntimos inteiros. A preparação da imagem reutiliza os componentes do processador instalado, mantendo os mesmos textos e inferências por categoria.

São medições das operações isoladas, com dados sintéticos, e não da aplicação completa nem de um telemóvel físico. A contagem de preparação de píxeis é verificada pelo teste do adaptador; não representa uma aceleração de nove vezes da inferência neural.

Validação: sintaxe, 31 testes de domínio/PostgreSQL/autenticação/visão e testes Chromium de modo offline, checkout, separação de contas, recuperação da cache e runtime ONNX/WASM aprovados. A integração com os pesos reais e a reabertura offline foi [aprovada no CI](https://github.com/AndreLeal-L2/FoodStock-Manager/actions/runs/41949380924), com WASM numa thread. A fotografia pública produziu os mesmos nomes e pontuações da versão anterior; manteve também o falso positivo já documentado. Não houve upload da imagem.

O reconhecimento continua experimental, com revisão obrigatória. Não foram alterados o esquema Supabase, as operações de stock/compra, o modelo visual ou os limiares de identificação. Não houve calibração nova de precisão ou medição em hardware móvel físico.
