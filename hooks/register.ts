import type { Register } from 'claude-code'

const LIMITE_PERCENT = 85 // perto do limite da janela: avisa mesmo sem commit
const QUEDA_COMPACT = 0.6 // contexto abaixo de 60% do pico = houve /compact ou /clear
const COMMIT = /\bgit\s+(?:-\S+\s+\S+\s+)*commit\b/
const MARCA = '[indicador-de-contexto]'

type Niveis = { silencioso: number; avaliacao: number; reavaliacao: number }

// Valores do userConfig; um valor faltando ou inválido cai no padrão.
function lerNiveis(options: Readonly<Record<string, unknown>> | undefined): Niveis {
  const n = (chave: string, padrao: number) => {
    const v = Number(options?.[chave])
    return Number.isFinite(v) && v > 0 ? v : padrao
  }
  return { silencioso: n('nivel_silencioso', 200_000), avaliacao: n('nivel_avaliacao', 250_000), reavaliacao: n('nivel_reavaliacao', 400_000) }
}

// Com cache quente, contexto grande pesa pouco por passo; os níveis marcam quando dividir ou compactar compensa.
// Avaliação (250k): dividir só se ainda falta trabalho grande e separável. Reavaliação (400k): compactar ou chat novo.
function textoDividir(k: number): string {
  return `${MARCA} Contexto em ~${k}k. Na mesma tarefa, siga neste chat. No próximo ponto de transição (pedaço commitado, entrega para teste): se ainda falta trabalho grande e separável (outra issue ou bloco, umas 40 rodadas ou mais), proponha ao usuário passar esse resto para um chat novo (## Passagem na issue: arquivo:linha do que ela chama ou mexe, decisões que pegam, armadilhas; até ~40 linhas) ou para um subagente. Senão, siga sem comentar.`
}

function textoTeto(k: number, teto: number): string {
  return `${MARCA} Contexto em ~${k}k, acima de ${teto}k. Termine o passo em curso. No próximo ponto de transição (pedaço commitado, entrega para teste), proponha ao usuário um caminho, em poucas linhas: (1) o que vem depende desta conversa (decisões e porquês, regra descoberta, diagnóstico, ajuste pós-teste) → /compact com foco (/foco-compact), que mantém isso e descarta leituras de arquivo e logs; (2) o que vem só precisa do que já está commitado → ## Passagem na issue seguinte e o prompt curto para um chat novo; (3) faltam umas 10 rodadas ou menos → continuar, dito em uma linha. Seguir em silêncio não é opção. /compact e /clear só com autorização dele.`
}

async function textoCompact($: any): Promise<string> {
  let branch = ''
  let ultimo = ''
  try {
    branch = (await $.process.run(['git', 'branch', '--show-current'], { timeoutMs: 5000 })).stdout.trim()
    ultimo = (await $.process.run(['git', 'log', '-1', '--format=%s'], { timeoutMs: 5000 })).stdout.trim()
  } catch {
    // sem git: o texto sai genérico
  }
  const onde = branch ? ` na branch ${branch}` : ''
  const feito = ultimo ? ` Último commit: "${ultimo}".` : ''
  return `/compact foco: tarefa em andamento${onde}.${feito} Manter: issue, decisões e motivos, regras de negócio descobertas, hipóteses em aberto, arquivos tocados, estado dos testes (o que passou, falhou ou falta rodar), pendências e o próximo passo. Descartar: saídas longas de teste/build já resolvidas e leituras de arquivo que não vão mais mudar.`
}

export const register: Register = (on, options) => {
  const niveis = lerNiveis(options)
  const estado = {
    tokens: 0,
    percent: 0,
    pico: 0,
    nivel: 0, // 0 nada · 1 silencioso · 2 avaliação pedida · 3 reavaliação pedida
    pendente: undefined as string | undefined, // aviso esperando a próxima chance de chegar ao modelo
    commitFeito: false,
    avisouCommit: false,
    avisouLimite: false,
  }

  // Entrega o aviso uma vez e esquece; quem chamar depois não recebe de novo.
  const retirar = () => {
    const t = estado.pendente
    estado.pendente = undefined
    return t
  }

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'foco-compact', description: 'Texto pronto do /compact com foco, para copiar' })
    return next(e)
  })

  on('command.run', { command: 'foco-compact' }, async $ => ({ text: await textoCompact($) }))

  on('tool.call', async (_$, e, next) => {
    const r = await next(e)
    if (e.tool === 'Bash' && COMMIT.test(String((e as { command?: string }).command ?? '')) && r.deny === undefined && r.isError !== true)
      estado.commitFeito = true
    // Só chamada do modelo no loop principal: a de outro mod ($.tool.call) descarta o context, e a de subagente não chega a este modelo.
    if (!estado.pendente || r.deny !== undefined || e.agentId !== undefined || next.origin.plugin !== 'engine') return r
    return { ...r, context: [...(r.context ?? []), retirar()!] } as typeof r
  })

  // Sem chamada de ferramenta no caminho (só conversa), o aviso vai com o próximo prompt.
  on('prompt.submit', (_$, e, next) => {
    if (!estado.pendente) return next(e)
    return next({ ...e, context: [...(e.context ?? []), retirar()!] })
  })

  on('session.measure', ($, e, next) => {
    if (e.changed.includes('context') && e.context.tokens !== undefined) {
      const t = e.context.tokens
      estado.tokens = t
      estado.percent = e.context.percent ?? 0
      if (estado.pico && t < estado.pico * QUEDA_COMPACT) {
        // depois de /compact ou /clear: os níveis voltam a valer
        Object.assign(estado, { pico: 0, nivel: 0, pendente: undefined, commitFeito: false, avisouCommit: false, avisouLimite: false })
        $.ui.status(undefined)
      }
      estado.pico = Math.max(estado.pico, t)
      const k = Math.round(t / 1000)

      // Pulou mais de um nível entre duas medições: vale só o mais alto, numa mensagem só.
      const alvo = t >= niveis.reavaliacao ? 3 : t >= niveis.avaliacao ? 2 : t >= niveis.silencioso ? 1 : 0
      if (alvo > estado.nivel) {
        // um aviso pendente de nível menor é substituído, não acumula
        if (alvo >= 2) estado.pendente = alvo === 3 ? textoTeto(k, Math.round(niveis.reavaliacao / 1000)) : textoDividir(k)
        estado.nivel = alvo
      }
      // abaixo do nível silencioso a linha de status fica vazia
      if (estado.nivel >= 1) $.ui.status(`contexto ~${k}k${estado.nivel >= 2 ? ' · avaliação pedida ao modelo' : ''}`)

      if (t >= niveis.reavaliacao && estado.commitFeito && !estado.avisouCommit) {
        estado.avisouCommit = true
        $.ui.toast(`Contexto em ${k}k e acabou de commitar: boa hora de /compact. Rode /foco-compact para o texto pronto.`, { timeoutMs: 20000 })
      } else if (estado.percent >= LIMITE_PERCENT && !estado.avisouLimite) {
        estado.avisouLimite = true
        $.ui.toast(`Contexto em ${k}k (${estado.percent}% da janela). Commite o que funciona e compacte (/foco-compact).`, { timeoutMs: 20000 })
      }
    }
    return next(e)
  })
}
