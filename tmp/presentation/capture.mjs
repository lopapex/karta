import { chromium } from 'playwright'
import path from 'node:path'

const out = path.resolve('tmp/presentation/shots')
const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
})

const client = {
  id: 'peta', title: 'Péťa Nováková', sourceTemplateId: 'basic', archivedAt: null,
  createdAt: '2026-09-01T10:00:00Z', updatedAt: '2026-09-09T18:12:00Z',
  fields: [
    { id: 'email', label: 'E-mail', fieldType: 'email', required: false, options: [], value: 'peta@example.cz' },
    { id: 'phone', label: 'Telefon', fieldType: 'phone', required: false, options: [], value: '+420 777 123 456' },
    { id: 'city', label: 'Bydliště', fieldType: 'text', required: false, options: [], value: 'Praha' },
  ],
}
const templates = [
  { id: 'basic', name: 'Základní karta', description: '', fieldCount: 3, fieldLabels: ['E-mail', 'Telefon', 'Bydliště'], updatedAt: '2026-09-09T18:12:00Z', isDefault: true },
  { id: 'therapy', name: 'První konzultace', description: '', fieldCount: 5, fieldLabels: ['E-mail', 'Telefon', 'Bydliště', 'Zakázka', 'Poznámka'], updatedAt: '2026-09-08T12:00:00Z', isDefault: false },
]
const visits = [
  { id: 'v1', clientId: 'peta', visitDate: '2026-09-09', notesPreview: 'Dnes jsme probraly, co se od minulé návštěvy změnilo…', createdAt: '2026-09-09T18:12:00Z', updatedAt: '2026-09-09T18:12:00Z' },
  { id: 'v2', clientId: 'peta', visitDate: '2026-08-26', notesPreview: 'Úvodní setkání a domluva dalšího postupu…', createdAt: '2026-08-26T14:00:00Z', updatedAt: '2026-08-26T14:00:00Z' },
]

async function pageFor(status = 'unlocked') {
  const page = await browser.newPage({ viewport: { width: 1180, height: 760 }, deviceScaleFactor: 1 })
  await page.addInitScript(({ status, client, templates, visits }) => {
    const template = { ...templates[0], fields: client.fields.map(({ value, ...field }) => field), createdAt: '2026-09-01T10:00:00Z' }
    window.__TAURI_INTERNALS__ = {
      invoke: async (cmd) => {
        if (cmd === 'get_security_status') return { state: status }
        if (cmd === 'list_clients') return [{ id: 'peta', title: 'Péťa Nováková', archivedAt: null, updatedAt: client.updatedAt }, { id: 'jana', title: 'Jana Veselá', archivedAt: null, updatedAt: '2026-09-08T09:30:00Z' }, { id: 'klara', title: 'Klára Dvořáková', archivedAt: null, updatedAt: '2026-09-04T11:00:00Z' }]
        if (cmd === 'get_client') return client
        if (cmd === 'list_visits') return visits
        if (cmd === 'get_visit') return { ...visits[0], notes: 'Dnes jsme probraly, co se od minulé návštěvy změnilo. Péťa popsala klidnější týden a několik malých situací, které zvládla jinak než dřív.\n\nDomluvily jsme se, že si do příště všimne okamžiků, kdy na sebe klade zbytečně vysoké nároky. Bez domácích úkolů na tři stránky. To by byl trest, ne terapie.' }
        if (cmd === 'list_templates') return templates
        if (cmd === 'get_template') return template
        return null
      },
      transformCallback: () => 1, unregisterCallback: () => {}, runCallback: () => {}, callbacks: new Map(),
      convertFileSrc: (value) => value,
    }
    localStorage.setItem('karta.theme', 'light')
  }, { status, client, templates, visits })
  return page
}

async function capture(name, route, action) {
  const page = await pageFor()
  await page.goto(`http://localhost:5173/#${route}`)
  await page.waitForTimeout(600)
  if (action) await action(page)
  await page.screenshot({ path: path.join(out, `${name}.png`) })
  await page.close()
}

{
  const page = await pageFor('locked')
  await page.goto('http://localhost:5173/')
  await page.waitForTimeout(600)
  await page.screenshot({ path: path.join(out, '01-lock.png') })
  await page.close()
}
await capture('02-clients', '/clients')
await capture('03-detail', '/clients/peta')
await capture('04-visit', '/clients/peta', async (page) => {
  await page.getByRole('button', { name: 'Přidat záznam' }).click()
  await page.waitForTimeout(250)
  await page.locator('textarea').fill('Dnešní zápis začíná stručně. Pak se rozroste podle potřeby, protože myšlenky se do malého okénka nevejdou.\n\nKARTA naštěstí neříká: zbývá vám 140 znaků.')
})
await capture('05-templates', '/templates')
await capture('06-settings', '/settings')

await browser.close()
