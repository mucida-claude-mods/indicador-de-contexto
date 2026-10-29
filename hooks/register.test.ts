import { test, expect } from 'claude-code/testing'

// Testes simulados: o kit põe o engine embaixo do mod. Não provam que a interface desenha nem que o modelo leu.
const MARCA = '[indicador-de-contexto]'
const toasts: string[] = []
const status: (string | undefined)[] = []
const prompts: (readonly string[] | undefined)[] = []

const medir = ($: any, tokens: number, percent = 10) =>
  $.session.measure({ context: { tokens, window: 1_000_000, percent }, rateLimits: [], changed: ['context'] } as any)

const base = (on: any, falha = false) => {
  toasts.length = 0
  status.length = 0
  prompts.length = 0
  on('session.start', () => ({ cwd: '/r' }))
  on('command.register', () => ({ value: undefined }))
  on('ui.toast', (_$: any, e: any) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.status', (_$: any, e: any) => {
    status.push(e.text)
    return { value: undefined }
  })
  on('session.measure', (_$: any, e: any) => ({ changed: e.changed }))
  on('tool.call', (_$: any, e: any) => (e.command === 'NEGAR' ? { deny: 'negado no teste' } : falha ? { isError: true, result: 'falhou' } : { result: {}, text: 'ok' }))
  on('prompt.submit', (_$: any, e: any) => {
    prompts.push(e.context)
    return { text: e.text, context: e.context }
  })
  on('process.run', (_$: any, e: any) => ({
    value: { exitCode: 0, stdout: e.argv.includes('--show-current') ? 'fix/38-x\n' : 'fix: algo (#38)\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  }))
}
const commit = ($: any) => $.tool.call({ tool: 'Bash', command: 'git commit -m "x (#1)"' })
// Chamada do modelo no loop principal; devolve só os avisos deste mod.
const chamar = async ($: any, extra: Record<string, unknown> = {}) => {
  const r: any = await $.tool.call({ tool: 'Bash', command: 'ls', ...extra })
  return ((r.context ?? []) as string[]).filter(c => c.startsWith(MARCA))
}
const avisosNoPrompt = () => prompts.flatMap(c => (c ?? []).filter(x => x.startsWith(MARCA)))

// ---- comportamento visual antigo, preservado ----

test('visual: contexto grande + commit avisa uma vez', async ($, on) => {
  base(on)
  await $.session.start({ cwd: '/r' } as any)
  await medir($, 410_000)
  expect(toasts.length, 'sem commit não avisa').toBe(0)
  await commit($)
  await medir($, 415_000)
  expect(toasts.length, 'com commit avisa').toBe(1)
  expect(toasts[0]!.includes('/compact')).toBe(true)
  await medir($, 420_000)
  expect(toasts.length, 'só uma vez').toBe(1)
})

test('visual: contexto pequeno + commit não avisa', async ($, on) => {
  base(on)
  await commit($)
  await medir($, 90_000)
  expect(toasts.length).toBe(0)
})

test('visual: commit entre 250k e 400k ainda não sugere /compact', async ($, on) => {
  base(on)
  await commit($)
  await medir($, 300_000)
  expect(toasts.length).toBe(0)
})

test('visual: commit que falhou não conta', async ($, on) => {
  base(on, true)
  await commit($)
  await medir($, 420_000)
  expect(toasts.length).toBe(0)
})

test('visual: perto do limite da janela avisa mesmo sem commit', async ($, on) => {
  base(on)
  await medir($, 850_000, 88)
  expect(toasts.length).toBe(1)
})

test('/foco-compact devolve o texto pronto com branch, último commit e o que preservar', async ($, on) => {
  base(on)
  const r: any = await $.command.run({ command: 'foco-compact', args: '' } as any)
  expect(r.text.startsWith('/compact foco:'), r.text).toBe(true)
  expect(r.text.includes('fix/38-x') && r.text.includes('fix: algo (#38)'), r.text).toBe(true)
  expect(r.text.includes('testes') && r.text.includes('hipóteses'), r.text).toBe(true)
})

// ---- níveis ----

test('abaixo de 200k: nada na tela nem no modelo', async ($, on) => {
  base(on)
  await medir($, 190_000)
  expect(await chamar($)).toEqual([])
  expect(status.length).toBe(0)
})

test('200k é silencioso: linha de status, nada ao modelo', async ($, on) => {
  base(on)
  await medir($, 210_000)
  expect(await chamar($)).toEqual([])
  await $.prompt.submit({ text: 'oi' } as any)
  expect(avisosNoPrompt()).toEqual([])
  expect(status.at(-1)).toBe('contexto ~210k')
  expect(toasts.length).toBe(0)
})

test('250k: avaliação chega ao modelo uma vez, na próxima chamada', async ($, on) => {
  base(on)
  await medir($, 210_000)
  await medir($, 252_000)
  const a = await chamar($)
  expect(a.length).toBe(1)
  expect(a[0]!.includes('~252k') && a[0]!.includes('grande e separável')).toBe(true)
  expect(a[0]!.includes('## Passagem') && a[0]!.includes('Senão, siga sem comentar')).toBe(true)
  expect(status.at(-1)).toBe('contexto ~252k · avaliação pedida ao modelo')
  // novas medições no mesmo nível não repetem
  await medir($, 260_000)
  await medir($, 375_000)
  expect(await chamar($)).toEqual([])
  await $.prompt.submit({ text: 'segue' } as any)
  expect(avisosNoPrompt()).toEqual([])
})

test('400k: teto, uma vez, depois da avaliação entregue', async ($, on) => {
  base(on)
  await medir($, 255_000)
  expect((await chamar($)).length).toBe(1)
  await medir($, 405_000)
  const b = await chamar($)
  expect(b.length).toBe(1)
  expect(b[0]!.includes('acima de 400k') && b[0]!.includes('~405k') && b[0]!.includes('/foco-compact')).toBe(true)
  expect(b[0]!.includes('Seguir em silêncio não é opção') && b[0]!.includes('só com autorização')).toBe(true)
  await medir($, 450_000)
  await medir($, 600_000)
  expect(await chamar($)).toEqual([])
})

test('crescimento rápido: de 150k para 410k numa medição sai uma mensagem só, a do teto', async ($, on) => {
  base(on)
  await medir($, 150_000)
  await medir($, 410_000)
  const a = await chamar($)
  expect(a.length).toBe(1)
  expect(a[0]!.includes('acima de 400k'), 'a do teto, não a de dividir').toBe(true)
  expect(await chamar($)).toEqual([])
})

test('250k ainda não entregue e já 400k: substitui pela do teto, não acumula', async ($, on) => {
  base(on)
  await medir($, 251_000)
  await medir($, 403_000)
  const a = await chamar($)
  expect(a.length).toBe(1)
  expect(a[0]!.includes('acima de 400k') && a[0]!.includes('~403k')).toBe(true)
})

test('sem chamada de ferramenta, o aviso vai com o próximo prompt, e só ali', async ($, on) => {
  base(on)
  await medir($, 251_000)
  await $.prompt.submit({ text: 'e agora?' } as any)
  expect(avisosNoPrompt().length).toBe(1)
  expect(await chamar($)).toEqual([])
})

test('reset depois de /compact (538k → 61k, o caso real) e níveis reiniciados', async ($, on) => {
  base(on)
  await commit($)
  await medir($, 255_000)
  await chamar($)
  await medir($, 410_000)
  await chamar($)
  await medir($, 538_000)
  await medir($, 61_000)
  expect(status.at(-1), 'linha de status limpa').toBe(undefined)
  expect(await chamar($)).toEqual([])
  await medir($, 210_000)
  expect(await chamar($)).toEqual([])
  await medir($, 253_000)
  const a = await chamar($)
  expect(a.length, 'avaliação volta a valer').toBe(1)
  expect(a[0]!.includes('grande e separável')).toBe(true)
  expect(toasts.filter(t => t.includes('acabou de commitar')).length, 'toast do commit também reiniciou e exige commit novo').toBe(1)
})

test('compact que cai para cima de 250k: níveis reiniciam e pedem avaliação uma vez', async ($, on) => {
  base(on)
  await medir($, 255_000)
  await chamar($)
  await medir($, 700_000)
  await medir($, 300_000)
  const a = await chamar($)
  expect(a.length).toBe(1)
  expect(a[0]!.includes('grande e separável')).toBe(true)
})

test('aviso pendente descartado no reset não vaza depois', async ($, on) => {
  base(on)
  await medir($, 300_000)
  await medir($, 50_000)
  expect(await chamar($)).toEqual([])
  await $.prompt.submit({ text: 'oi' } as any)
  expect(avisosNoPrompt()).toEqual([])
})

test('níveis configuráveis pelo userConfig', { options: { nivel_silencioso: 50_000, nivel_avaliacao: 80_000, nivel_reavaliacao: 90_000 } }, async ($, on) => {
  base(on)
  await medir($, 60_000)
  expect(await chamar($)).toEqual([])
  expect(status.at(-1)).toBe('contexto ~60k')
  await medir($, 82_000)
  expect((await chamar($)).length).toBe(1)
  await medir($, 95_000)
  expect((await chamar($))[0]!.includes('acima de 90k')).toBe(true)
})

// ---- outros mods e subagentes não consomem o aviso ----

test('chamada de subagente não consome o aviso', async ($, on) => {
  base(on)
  await medir($, 251_000)
  expect(await chamar($, { agentId: 'ag1' })).toEqual([])
  expect((await chamar($)).length).toBe(1)
})

test('$.tool.call de outro mod não consome o aviso', {
  plugins: [{ name: 'outro', register(on) {
    on('session.start', async ($: any, e: any, next: any) => { await $.command.register({ name: 'x', description: 'x' }); return next(e) })
    on('command.run', { command: 'x' }, async ($: any) => {
      const r: any = await $.tool.call({ tool: 'Bash', command: 'ls' })
      return { text: JSON.stringify(r.context ?? []) }
    })
  } }],
}, async ($, on) => {
  base(on)
  await $.session.start({ cwd: '/r' } as any)
  await medir($, 251_000)
  const r: any = await $.command.run({ command: 'x', args: '' } as any)
  expect(r.text.includes(MARCA), 'chamada do outro mod sem aviso').toBe(false)
  expect((await chamar($)).length, 'aviso continua para o modelo').toBe(1)
})

for (const tier of ['prepend', 'append'] as const)
  test(`mod que responde a própria ferramenta sem next (tier ${tier}) não faz o aviso sumir`, {
    plugins: [{ name: 'barra', tier, register(on) {
      on('tool.call', { tool: 'mcp__barra__registrar' } as any, () => ({ result: 'ok' }) as any)
    } }],
  }, async ($, on) => {
    base(on)
    await medir($, 251_000)
    const r: any = await $.tool.call({ tool: 'mcp__barra__registrar' } as any)
    const naBarra = ((r.context ?? []) as string[]).filter(c => c.startsWith(MARCA)).length
    const depois = (await chamar($)).length
    expect(naBarra + depois, 'entregue exatamente uma vez').toBe(1)
  })

test('convive com o context de outro mod (decisao-critica)', {
  plugins: [{ name: 'decisao', register(on) {
    on('tool.call', async (_$: any, e: any, next: any) => {
      const r = await next(e)
      return { ...r, context: [...(r.context ?? []), '[decisao-critica] lembrete'] }
    })
  } }],
}, async ($, on) => {
  base(on)
  await medir($, 251_000)
  const r: any = await $.tool.call({ tool: 'Bash', command: 'ls' } as any)
  expect(r.context.some((c: string) => c.startsWith('[decisao-critica]'))).toBe(true)
  expect(r.context.filter((c: string) => c.startsWith(MARCA)).length).toBe(1)
})

test('chamada negada não consome o aviso', async ($, on) => {
  base(on)
  await medir($, 251_000)
  const negada: any = await $.tool.call({ tool: 'Bash', command: 'NEGAR' } as any)
  expect(negada.deny, 'a chamada foi mesmo negada').toBe('negado no teste')
  expect((await chamar($)).length).toBe(1)
})
