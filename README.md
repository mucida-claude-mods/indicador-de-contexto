# indicador-de-contexto

Mod do Claude Code que acompanha o tamanho do contexto do chat e avisa o modelo na hora certa de dividir o trabalho ou compactar.

| Nível (padrão) | O que acontece |
|---|---|
| 200k | a linha de status passa a mostrar o contexto; o modelo não recebe nada |
| 250k | o modelo recebe uma vez: na mesma tarefa, siga; no próximo ponto de transição, proponha passar o resto para chat novo ou subagente só se ainda falta trabalho grande e separável |
| 400k | o modelo recebe uma vez: no próximo ponto de transição, proponha `/compact` com foco, chat novo ou continuar (se faltam poucas rodadas) |

Também mostra um toast depois de um `git commit` acima de 400k, ou perto do limite da janela. Os avisos reiniciam depois de `/compact`. O comando `/foco-compact` devolve o texto do `/compact` com foco, com a branch e o último commit.

## Por que esses níveis
Com o cache de prompt quente, reler o contexto é barato (no Opus 5.5, $0,20 por milhão, contra $8 para escrever no cache de 1h). Num histórico real de ~9.500 passos, um passo a 300k custou ~2× um passo a 50k, e trocar de chat a 150k só se pagaria depois de ~36 passos. Por isso o mod deixa o chat crescer e só pede decisão quando dividir ou compactar compensa.

## Instalar
```bash
git clone https://github.com/OWNER/indicador-de-contexto ~/.claude/mods/indicador-de-contexto
```
Acrescente o caminho em `CLAUDE_CODE_PLUGIN_DIRS` (em `env` no `~/.claude/settings.json`; vários caminhos separados por `:`).

Os níveis são configuráveis em `userConfig` (`nivel_silencioso`, `nivel_avaliacao`, `nivel_reavaliacao`).

## Testes
```bash
claude plugin test .
claude plugin validate .
```
