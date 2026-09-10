import { ArrowLeft } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Link, useNavigate, useParams } from 'react-router'
import { useToast } from '../app/toast'
import { FieldLayoutEditor } from '../components/FieldLayoutEditor'
import { api, errorMessage } from '../domain/api'
import { templateSchema } from '../domain/schemas'
import type { TemplateInput } from '../domain/types'

export function TemplateFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [pageError, setPageError] = useState('')
  const [loading, setLoading] = useState(Boolean(id))
  const { register, control, handleSubmit, reset, setValue, formState: { errors, isSubmitting } } = useForm<TemplateInput>({ defaultValues: { name: '', description: '', fields: [] } })
  const fields = useWatch({ control, name: 'fields' }) ?? []

  useEffect(() => {
    if (!id) return
    api.getTemplate(id).then((template) => reset({ name: template.name, description: template.description, fields: template.fields })).catch((reason) => setPageError(errorMessage(reason))).finally(() => setLoading(false))
  }, [id, reset])

  async function save(values: TemplateInput) {
    setPageError('')
    const parsed = templateSchema.safeParse(values)
    if (!parsed.success) { setPageError(parsed.error.issues[0]?.message ?? 'Zkontrolujte pole šablony.'); return }
    try {
      if (id) await api.updateTemplate(id, parsed.data)
      else await api.createTemplate(parsed.data)
      showToast(id ? 'Šablona byla uložena.' : 'Šablona byla vytvořena.')
      navigate('/templates')
    } catch (reason) { setPageError(errorMessage(reason)) }
  }

  if (loading) return <p className="loading-state">Načítám šablonu…</p>
  return (
    <section className="page page--wide" aria-labelledby="template-form-title">
      <Link className="back-link" to="/templates"><ArrowLeft size={16} />Šablony</Link>
      <header className="page-header"><h1 id="template-form-title">{id ? 'Upravit šablonu' : 'Nová šablona'}</h1></header>
      <form className="editor-form" onSubmit={handleSubmit(save)}>
        <div className="form-section two-column-form">
          <label className="field-label">Název šablony<input className="text-input" {...register('name', { required: true })} />{errors.name ? <span className="field-error">Zadejte název.</span> : null}</label>
          <label className="field-label">Popis<textarea className="text-input textarea textarea--compact" {...register('description')} /></label>
        </div>
        <FieldLayoutEditor fields={fields} onChange={(next) => setValue('fields', next, { shouldDirty: true })} />
        {pageError ? <p className="form-error" role="alert">{pageError}</p> : null}
        <div className="form-actions"><Link className="button button--quiet" to="/templates">Zrušit</Link><button className="button button--primary" disabled={isSubmitting} type="submit">{isSubmitting ? 'Ukládám…' : 'Uložit šablonu'}</button></div>
      </form>
    </section>
  )
}
