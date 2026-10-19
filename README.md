# Onde Voto? — versão 1.2.0 | Consulta por cidade e zona opcional

Esta landing page **independente** procura publicações documentadas sobre mudanças de locais de votação no segundo turno das Eleições 2026. Não é um serviço oficial, não usa CPF e **não consulta o cadastro individual do TSE em tempo real**.

## Escopo geográfico obrigatório

A pesquisa ficou **restrita a SP (São Paulo), MG (Minas Gerais), RJ (Rio de Janeiro) e BA (Bahia)**, os estados do levantamento inicial. O seletor da interface apresenta somente esses quatro estados, a API retorna HTTP **422** para os demais e o importador de CSV recusa registros de outros estados. A base publicada não inclui Alagoas e não deve ser ampliada automaticamente para outras UFs.

**Estado monitorado não significa que todas as suas cidades ou zonas eleitorais mudaram.** A disponibilidade de um estado no formulário indica somente que ele pertence ao escopo de pesquisa.

## Cobertura e funcionamento

A interface permite selecionar um estado e uma cidade, **sem exigir zona ou seção**. Ao selecionar uma cidade, a página consulta automaticamente os registros. Zonas conhecidas aparecem em cartões clicáveis e filtram o resultado; a seção pode ser informada em um filtro avançado. Cidades com muitos registros mostram detalhes recolhíveis para facilitar a navegação.

- **São Paulo:** 34 municípios e 413 seções no espelho secundário.
- **Minas Gerais:** 67 municípios e 337 seções no espelho secundário.
- **Rio de Janeiro:** 9 municípios e 47 seções no espelho secundário, além de um comunicado direto do TRE-RJ para a 188ª zona do município do Rio de Janeiro.
- **Bahia:** 48 municípios e 187 seções no espelho secundário.

Os dados secundários estão armazenados em `data/zonas-2026-{sp,mg,rj,ba}.json`, reproduzidos do levantamento publicado em https://dapravirar.org/mudou-o-local e atribuído aos dados do TSE de 17/10/2026. **Não foram homologados individualmente junto aos TREs.** A origem e a data são exibidas no resultado. Os endereços incompletos recebem aviso e não geram link de navegação.

A base `data/alteracoes-2026.json` mantém os registros confirmados diretamente em comunicado eleitoral e o escopo geográfico. Ausência de registro, em qualquer base, **não permite concluir que o local permaneceu igual**.

## Usabilidade e validação

- Pesquisa automática por cidade, com zona e seção opcionais.
- Troca de cidade limpa zona, seção e resultados desatualizados.
- Resultados recolhíveis quando a cidade contém muitos locais.
- Link de mapa/rota somente quando o novo endereço possui informação suficiente.
- Layout mobile compacto, opção de movimento reduzido, controles por teclado, foco visível e nomes acessíveis.
- 19 testes automatizados de dados, interface e integridade de escopo.
- Cenários executados no Chromium para smartphone e desktop, sem rolagem horizontal e sem erros de JavaScript.
- Auditoria automática axe-core WCAG 2 A/AA e 2.1 A/AA sem violações nas telas inicial e de consulta testadas. Isso não substitui testes manuais com tecnologias assistivas.

A consulta oficial individual permanece no [Autoatendimento Eleitoral do TSE](https://www.tse.jus.br/servicos-eleitorais/autoatendimento-eleitoral#/atendimento-eleitor/onde-votar) ou no e-Título.

## Executar

```bash
npm start
# abrir http://localhost:3000
npm test
```

Sem bibliotecas extras ou compilação. Em hospedagem estática, `index.html` usa a base JSON local como fallback. Se houver servidor Node, a API atende:

- `GET /api/consulta?uf=RJ&cidade=Rio%20de%20Janeiro&zona=188&secao=123` → registro documentado
- `GET /api/consulta?uf=SP&cidade=Sao%20Paulo&zona=345` → consulta dentro do escopo, sem registro verificado na base
- `GET /api/consulta?uf=AL&cidade=Traipu&zona=20` → `422` (fora do escopo)
- `GET /api/health` → cobertura, UFs monitoradas e UFs com registros

O **arquivo mestre de escopo** é `data/alteracoes-2026.json`, propriedade `estados_monitorados`. Para que a interface também permaneça restrita, as opções `UFS` do arquivo `app.js` devem coincidir com esse escopo. O CSV é validado contra os mesmos quatro códigos dentro do importador.

## Importação controlada

1. Usar exportação oficial dos órgãos eleitorais ou comunicado primário validado, verificando que trata **de mudança para o segundo turno**.
2. Preparar o CSV no formato `data/modelo-importacao.csv`, incluindo UF, município, zona, seções, endereços e fonte.
3. Executar `npm run importar -- arquivo.csv`. Isso gera `data/importacao-pendente-revisao.json` e **não altera a base publicada**.
4. Conferir manualmente cada entrada, data e endereço; então promover à base, somente para SP, MG, RJ e BA.

A importação exige URL HTTPS e, para registros marcados `confirmado_tre`, exige domínio oficial `tre-XX.jus.br` ou `tse.jus.br`. O domínio da fonte isoladamente não comprova a mudança, que precisa de revisão humana.

## Fontes e limites

- [Comunicado oficial do TSE sobre consultar o local no segundo turno](https://www.tse.jus.br/comunicacao/noticias/2026/Outubro/consulte-com-antecedencia-o-local-onde-voce-ira-votar-no-2o-turno)
- [Comunicado oficial do TRE-RJ de alteração entre turnos](https://www.tre-rj.jus.br/comunicacao/noticias/2026/Outubro/eleicoes-2026-apenas-um-local-de-votacao-foi-alterado-para-o-segundo-turno-no-rj)
- [Autoatendimento oficial do TSE](https://www.tse.jus.br/servicos-eleitorais/autoatendimento-eleitoral#/atendimento-eleitor/onde-votar)
- [Estatísticas eleitorais do TSE](https://sig.tse.jus.br/)

A página é informativa, baseada em dados documentados; não fornece validação individual definitiva nem substitui o e-Título.

## Capturas do projeto

Capturas originais disponíveis no pacote local de design.



## Controle de versão

O projeto inclui testes automatizados na pasta `tests/` e um workflow do GitHub Actions em `.github/workflows/testes.yml`. Não contém credenciais, CPFs ou dados individuais de eleitores.
