import * as AlertDialog from '@radix-ui/react-alert-dialog'
import { NotePencil, Plus, Star, Trash, X } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useToast } from '../app/toast'
import { api, errorMessage } from '../domain/api'
import type { TemplateRecord, TemplateSummary } from '../domain/types'

export function TemplatesPage() {
  const [templates, setTemplates] = useState<TemplateSummary[]>([])
  const [templateDetails, setTemplateDetails] = useState<Record<string, TemplateRecord>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const { showToast } = useToast()

  async function load() {
    setLoading(true)
    setError('')
    try {
      const summaries = await api.listTemplates()
      setTemplates(summaries)
      const details = await Promise.all(summaries.map((template) => api.getTemplate(template.id)))
      setTemplateDetails(Object.fromEntries(details.map((template) => [template.id, template])))
    }
    catch (reason) { setError(errorMessage(reason)) }
    finally { setLoading(false) }
  }

  useEffect(() => {
    api.listTemplates()
      .then(async (summaries) => {
        setTemplates(summaries)
        const details = await Promise.all(summaries.map((template) => api.getTemplate(template.id)))
        setTemplateDetails(Object.fromEntries(details.map((template) => [template.id, template])))
      })
      .catch((reason) => setError(errorMessage(reason)))
      .finally(() => setLoading(false))
  }, [])

  async function remove(id: string) {
    try {
      await api.deleteTemplate(id)
      showToast('Šablona byla smazána. Existující karty zůstaly beze změny.')
      await load()
    } catch (reason) { setError(errorMessage(reason)) }
  }

  async function makeDefault(id: string) {
    try { await api.setDefaultTemplate(id); showToast('Výchozí šablona byla změněna.'); await load() }
    catch (reason) { setError(errorMessage(reason)) }
  }

  return (
    <section className="page page--wide" aria-labelledby="templates-title">
      <header className="page-header page-header--actions">
        <h1 id="templates-title">Šablony</h1>
        <Link className="button button--primary" to="/templates/new"><Plus size={18} />Nová šablona</Link>
      </header>
      {error ? <div className="inline-notice inline-notice--error" role="alert">{error}</div> : null}
      {loading ? <p className="loading-state" role="status">Načítám šablony…</p> : null}
      {!loading && templates.length === 0 ? (
        <div className="empty-state">
          <div><h2>Žádné šablony</h2><p>Zatím zde nejsou žádné šablony.</p></div>
        </div>
      ) : null}
      <div className="record-list">
        {templates.map((template) => (
          <article className="record-row" key={template.id}>
            <div className="record-copy"><h2>{template.name} {template.isDefault ? <span className="status-badge">Výchozí</span> : null}</h2><p>{templateDetails[template.id]?.fields.map((field) => field.label).join(', ') || 'Bez polí'}</p></div>
            <span className="template-count">{template.fieldCount} {template.fieldCount === 1 ? 'pole' : template.fieldCount >= 2 && template.fieldCount <= 4 ? 'pole' : 'polí'}</span>
            <div className="row-actions">
              {!template.isDefault ? <button className="button button--quiet" type="button" onClick={() => void makeDefault(template.id)}><Star size={16} />Nastavit jako výchozí</button> : null}
              <Link className="button button--quiet" to={`/templates/${template.id}/edit`}><NotePencil size={16} />Upravit</Link>
              <AlertDialog.Root>
                <span className="disabled-tooltip" title={templates.length === 1 ? 'Poslední šablonu nelze smazat' : undefined}><AlertDialog.Trigger asChild><button className="icon-button icon-button--danger" disabled={templates.length === 1} aria-label={`Smazat šablonu ${template.name}`}><Trash size={18} /></button></AlertDialog.Trigger></span>
                <AlertDialog.Portal>
                  <AlertDialog.Overlay className="dialog-overlay" />
                  <AlertDialog.Content className="dialog-content">
                    <div className="dialog-heading"><div><AlertDialog.Title>Smazat šablonu?</AlertDialog.Title><AlertDialog.Description>Existující karty zůstanou beze změny. Tuto akci nelze vrátit.</AlertDialog.Description></div><AlertDialog.Cancel className="icon-button" aria-label="Zavřít dialog"><X size={18} /></AlertDialog.Cancel></div>
                    <div className="dialog-actions"><AlertDialog.Cancel className="button button--quiet">Zrušit</AlertDialog.Cancel><AlertDialog.Action className="button button--danger" onClick={() => void remove(template.id)}>Smazat šablonu</AlertDialog.Action></div>
                  </AlertDialog.Content>
                </AlertDialog.Portal>
              </AlertDialog.Root>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
