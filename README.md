# Onde Voto? — versão 1.1.0 | Escopo em quatro estados

Esta landing page **independente** procura publicações documentadas sobre mudanças de locais de votação no segundo turno das Eleições 2026. Não é um serviço oficial, não usa CPF e **não consulta o cadastro individual do TSE em tempo real**.

## Escopo geográfico obrigatório

A pesquisa ficou **restrita a SP (São Paulo), MG (Minas Gerais), RJ (Rio de Janeiro) e BA (Bahia)**, os estados do levantamento inicial. O seletor da interface apresenta somente esses quatro estados, a API retorna HTTP **422** para os demais e o importador de CSV recusa registros de outros estados. A base publicada não inclui Alagoas e não deve ser ampliada automaticamente para outras UFs.

**Estado monitorado não significa que todas as suas cidades ou zonas eleitorais mudaram.** A disponibilidade de um estado no formulário indica somente que ele pertence ao escopo de pesquisa.

## Cobertura real desta versão

- **RJ:** cinco seções eleitorais (123–127), 188ª Zona Eleitoral no Rio de Janeiro, com alteração entre Brás de Pina e Penha Circular descrita em comunicado do TRE-RJ de 17/10/2026; inclui endereço anterior, novo endereço e link da fonte.
- **SP, MG e BA:** habilitados para pesquisa, mas **sem registros de endereço/zonas verificadas por fonte primária importados** nesta versão. A interface informa "Alteração não verificada nesta base" e recomenda consulta individual oficial. Isso **não** equivale a afirmar que não houve alterações nesses estados.
- **AL e demais UFs:** removidos da base ativa e bloqueados na interface, API e importação.

A consulta por cidade e zona eleitoral retorna registros documentados; por seção, quando informada, filtra dentro das seções listadas. Nenhum resultado significa apenas **não identificado nesta base parcial**, nunca "sem alteração".

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

![Captura da versão desktop](docs/captura-desktop.png)

![Captura da versão mobile](docs/captura-mobile.png)

## Controle de versão

O projeto inclui testes automatizados na pasta `tests/` e um workflow do GitHub Actions em `.github/workflows/testes.yml`. Não contém credenciais, CPFs ou dados individuais de eleitores.