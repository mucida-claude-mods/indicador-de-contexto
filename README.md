# indicador-de-contexto

*"Context indicator"* — a Claude Code mod that watches how big the chat's context is and tells the model, at the right time, to split the work or compact.

| Level (default) | What happens |
|---|---|
| 200k | the status line starts showing the context; the model gets nothing |
| 250k | the model is told once: same task, carry on; at the next transition point, propose moving the rest to a new chat or subagent only if something big and separable is left |
| 400k | the model is told once: at the next transition point, propose a focused `/compact`, a new chat, or carrying on (if only a few rounds are left) |

It also shows a toast after a `git commit` above 400k or close to the window limit. Warnings reset after `/compact`. `/foco-compact` returns the text for a focused `/compact`, with the branch and the last commit. Levels are configurable (`nivel_silencioso`, `nivel_avaliacao`, `nivel_reavaliacao`). Messages to the model and on screen are in Portuguese.

**Why these levels:** with a warm prompt cache, re-reading context is cheap (Opus 5.5: $0.20 per million vs $8 to write to the 1h cache). In a real history of ~9,500 steps, a step at 300k cost ~2× a step at 50k. So the mod lets the chat grow and only asks for a decision when splitting or compacting pays off.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install indicador-de-contexto --marketplace mucida-claude-mods/indicador-de-contexto
```

Answer `y` to add the marketplace, then choose a scope (user scope shows it in every project).

## Em português

Mod do Claude Code que acompanha o tamanho do contexto do chat e avisa o modelo na hora certa de dividir o trabalho ou compactar.

| Nível (padrão) | O que acontece |
|---|---|
| 200k | a linha de status passa a mostrar o contexto; o modelo não recebe nada |
| 250k | o modelo recebe uma vez: na mesma tarefa, siga; no próximo ponto de transição, proponha passar o resto para chat novo ou subagente só se ainda falta trabalho grande e separável |
| 400k | o modelo recebe uma vez: no próximo ponto de transição, proponha `/compact` com foco, chat novo ou continuar (se faltam poucas rodadas) |

Também mostra um toast depois de um `git commit` acima de 400k, ou perto do limite da janela. Os avisos reiniciam depois de `/compact`. O comando `/foco-compact` devolve o texto do `/compact` com foco, com a branch e o último commit.

### Por que esses níveis
Com o cache de prompt quente, reler o contexto é barato (no Opus 5.5, $0,20 por milhão, contra $8 para escrever no cache de 1h). Num histórico real de ~9.500 passos, um passo a 300k custou ~2× um passo a 50k, e trocar de chat a 150k só se pagaria depois de ~36 passos. Por isso o mod deixa o chat crescer e só pede decisão quando dividir ou compactar compensa.

### Instalar
```bash
git clone https://github.com/mucida-claude-mods/indicador-de-contexto ~/.claude/mods/indicador-de-contexto
```
Acrescente o caminho em `CLAUDE_CODE_PLUGIN_DIRS` (em `env` no `~/.claude/settings.json`; vários caminhos separados por `:`).

Os níveis são configuráveis em `userConfig` (`nivel_silencioso`, `nivel_avaliacao`, `nivel_reavaliacao`).

### Testes
```bash
claude plugin test .
claude plugin validate .
```

## More mods by the same author / Mais mods do mesmo autor

All in one place: **[github.com/mucida-claude-mods](https://github.com/mucida-claude-mods)**

| Mod | What it does |
| --- | --- |
| [warm-me](https://github.com/mucida-claude-mods/warm-me) | Pixel-art fire showing whether the prompt cache is still warm |
| [critical-decisions](https://github.com/mucida-claude-mods/critical-decisions) | Shows the critical decisions the agent made without asking |
| [indicador-de-contexto](https://github.com/mucida-claude-mods/indicador-de-contexto) | Warns when to split or compact the chat (250k / 400k) |
| [novo-chat-ou-aqui](https://github.com/mucida-claude-mods/novo-chat-ou-aqui) | Should this extra step run here or in a new chat? |
| [pendencias](https://github.com/mucida-claude-mods/pendencias) | Chats that ended waiting on you |
| [telinha-mcp](https://github.com/mucida-claude-mods/telinha-mcp) | Which MCP the agent just called, in plain words |
| [faixa-de-terreno](https://github.com/mucida-claude-mods/faixa-de-terreno) | Branch, issue, dirty files and commits ahead of main |

## License

MIT
