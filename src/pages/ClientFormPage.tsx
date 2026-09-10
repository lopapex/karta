import * as AlertDialog from '@radix-ui/react-alert-dialog'
import * as Dialog from '@radix-ui/react-dialog'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { ArrowLeft, DotsThree, FloppyDisk, X } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { Link, useNavigate, useParams } from 'react-router'
import { useToast } from '../app/toast'
import { DynamicFields } from '../components/DynamicFields'
import { CustomFieldComposer } from '../components/CustomFieldComposer'
import { UiSelect } from '../components/UiSelect'
import { useDiscardChanges } from '../components/DiscardChangesGuard'
import { api, errorMessage } from '../domain/api'
import type { CardField, TemplateRecord, TemplateSummary } from '../domain/types'

interface ClientFormValues { title: string; templateId: string; values: Record<string, unknown> }
const emptyValue = (field: CardField) => field.fieldType === 'checkbox' ? false : field.fieldType === 'number' || field.fieldType === 'select' ? undefined : ''
const structureOnly = (fields: CardField[]) => fields.map((field) => ({ ...field, isCustom: false, value: undefined }))

export function ClientFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [templates, setTemplates] = useState<TemplateSummary[]>([])
  const [sourceTemplate, setSourceTemplate] = useState<TemplateRecord | null>(null)
  const [layoutFields, setLayoutFields] = useState<CardField[]>([])
  const [newTemplateOpen, setNewTemplateOpen] = useState(false)
  const [newTemplateName, setNewTemplateName] = useState('')
  const [confirmUpdateOpen, setConfirmUpdateOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const { register, control, handleSubmit, reset, setValue, getValues, formState: { errors, isSubmitting, isDirty } } =
    useForm<ClientFormValues>({ defaultValues: { title: '', templateId: '', values: {} } })
  const discard = useDiscardChanges(isDirty)

  useEffect(() => {
    void (async () => {
      try {
        const available = await api.listTemplates()
        setTemplates(available)
        if (id) {
          const client = await api.getClient(id)
          setLayoutFields(client.fields)
          if (client.sourceTemplateId) {
            try { setSourceTemplate(await api.getTemplate(client.sourceTemplateId)) } catch { setSourceTemplate(null) }
          }
          reset({ title: client.title, templateId: client.sourceTemplateId ?? available[0]?.id ?? '', values: Object.fromEntries(client.fields.map((field) => [field.id, field.value ?? emptyValue(field)])) })
        } else {
          const selected = available.find((template) => template.isDefault) ?? available[0]
          if (selected) {
            const template = await api.getTemplate(selected.id)
            const fields = template.fields.map((field) => ({ ...field, isCustom: false, value: emptyValue(field) }))
            setSourceTemplate(template)
            setLayoutFields(fields)
            reset({ title: '', templateId: template.id, values: Object.fromEntries(fields.map((field) => [field.id, emptyValue(field)])) })
          }
        }
      } catch (reason) { setError(errorMessage(reason)) }
      finally { setLoading(false) }
    })()
  }, [id, reset])

  async function applyTemplate(templateId: string, ask = true) {
    if (ask && isDirty) { discard.request(() => void applyTemplate(templateId, false)); return }
    setError('')
    try {
      const template = await api.getTemplate(templateId)
      const fields = template.fields.map((field) => ({ ...field, isCustom: false, value: emptyValue(field) }))
      setSourceTemplate(template)
      setLayoutFields(fields)
      setValue('templateId', templateId)
      setValue('values', Object.fromEntries(fields.map((field) => [field.id, emptyValue(field)])))
    } catch (reason) { setError(errorMessage(reason)) }
  }

  function fieldsWithValues(values = getValues('values')) {
    return layoutFields.map((field) => {
      const value = values[field.id]
      const emptyOptionalTypedValue = !field.required && (field.fieldType === 'number' || field.fieldType === 'select') && (value === '' || value === undefined || value === null)
      return emptyOptionalTypedValue ? { ...field, value: undefined } : { ...field, value: value ?? emptyValue(field) }
    })
  }

  async function save(values: ClientFormValues) {
    setError('')
    try {
      const fields = fieldsWithValues(values.values)
      if (id) {
        await api.updateClient(id, values.title, fields)
        showToast('Klient byl uložen.')
        navigate(`/clients/${id}`)
      } else {
        const created = await api.createClient(values.title, values.templateId, fields)
        showToast('Klient byl vytvořen.')
        navigate(`/clients/${created.id}`)
      }
    } catch (reason) { setError(errorMessage(reason)) }
  }

  async function saveNewTemplate(event: React.FormEvent) {
    event.preventDefault()
    try {
      const created = await api.createTemplate({ name: newTemplateName, description: '', fields: structureOnly(layoutFields) })
      setTemplates(await api.listTemplates())
      setSourceTemplate(created)
      setValue('templateId', created.id)
      setNewTemplateOpen(false)
      setNewTemplateName('')
      showToast('Rozložení bylo uloženo jako nová šablona.')
    } catch (reason) { setError(errorMessage(reason)) }
  }

  async function updateSourceTemplate() {
    if (!sourceTemplate) return
    try {
      const updated = await api.updateTemplate(sourceTemplate.id, { name: sourceTemplate.name, description: sourceTemplate.description, fields: structureOnly(layoutFields) })
      setSourceTemplate(updated)
      setConfirmUpdateOpen(false)
      showToast('Původní šablona byla aktualizována. Existující karty se nezměnily.')
    } catch (reason) { setError(errorMessage(reason)) }
  }

  if (loading) return <p className="loading-state">Načítám kartu…</p>
  return (
    <section className="page page--form" aria-labelledby="client-form-title">
      {discard.dialog}
      <Link className="back-link" to={id ? `/clients/${id}` : '/clients'} onClick={(event) => { if (isDirty) { event.preventDefault(); discard.request(() => navigate(id ? `/clients/${id}` : '/clients')) } }}><ArrowLeft size={16} />{id ? 'Zpět na klienta' : 'Klienti'}</Link>
      <header className="page-header page-header--actions">
        <h1 id="client-form-title">{id ? 'Upravit klienta' : 'Nový klient'}</h1>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild><button className="icon-button menu-trigger" aria-label="Akce rozložení"><DotsThree size={22} weight="bold" /></button></DropdownMenu.Trigger>
          <DropdownMenu.Portal><DropdownMenu.Content className="dropdown-content" align="end" sideOffset={6}>
            <DropdownMenu.Item className="dropdown-item" onSelect={() => { setNewTemplateName(sourceTemplate ? `${sourceTemplate.name} – kopie` : ''); setNewTemplateOpen(true) }}>Uložit jako novou šablonu</DropdownMenu.Item>
            <DropdownMenu.Item className="dropdown-item" disabled={!sourceTemplate} onSelect={() => setConfirmUpdateOpen(true)}>Aktualizovat původní šablonu</DropdownMenu.Item>
          </DropdownMenu.Content></DropdownMenu.Portal>
        </DropdownMenu.Root>
      </header>
      <form className="editor-form" onSubmit={handleSubmit(save)}>
        <div className="form-section two-column-form">
          <label className="field-label">Jméno klienta<input className="text-input" autoFocus {...register('title', { required: 'Zadejte jméno klienta.', maxLength: 160 })} />{errors.title ? <span className="field-error">{errors.title.message}</span> : null}</label>
          {!id ? <Controller name="templateId" control={control} render={({ field }) => <div className="field-label"><span>Šablona</span><UiSelect ariaLabel="Šablona" value={field.value || undefined} placeholder="Vyberte šablonu" onValueChange={(value) => void applyTemplate(value)} options={templates.map((template) => ({ value: template.id, label: template.isDefault ? `${template.name} · Výchozí` : template.name }))} /></div>} /> : null}
        </div>
        <div className="section-heading section-heading--values"><h2>Další údaje</h2></div>
        <DynamicFields fields={layoutFields} control={control} nameFor={(field) => `values.${field.id}`} onRemove={(field) => {
          const fields = layoutFields.filter((item) => item.id !== field.id)
          setLayoutFields(fields)
          setValue('values', Object.fromEntries(fields.map((item) => [item.id, getValues('values')[item.id] ?? emptyValue(item)])), { shouldDirty: true })
        }} />
        <CustomFieldComposer onDone={(field) => {
          setLayoutFields((current) => [...current, field])
          setValue(`values.${field.id}`, emptyValue(field), { shouldDirty: true })
        }} />
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="form-actions"><Link className="button button--quiet" to={id ? `/clients/${id}` : '/clients'} onClick={(event) => { if (isDirty) { event.preventDefault(); discard.request(() => navigate(id ? `/clients/${id}` : '/clients')) } }}>Zrušit</Link><button className="button button--primary" disabled={isSubmitting} type="submit">{isSubmitting ? 'Ukládám…' : id ? 'Uložit' : 'Vytvořit'}</button></div>
      </form>

      <Dialog.Root open={newTemplateOpen} onOpenChange={setNewTemplateOpen}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content"><div className="dialog-heading"><div><Dialog.Title>Uložit novou šablonu</Dialog.Title><Dialog.Description>Uloží se pouze rozložení polí, nikoli údaje klienta.</Dialog.Description></div><Dialog.Close className="icon-button" aria-label="Zavřít"><X size={18} /></Dialog.Close></div><form className="form-stack" onSubmit={saveNewTemplate}><label className="field-label">Název šablony<input className="text-input" value={newTemplateName} autoFocus required maxLength={160} onChange={(event) => setNewTemplateName(event.target.value)} /></label><div className="dialog-actions"><Dialog.Close className="button button--quiet">Zrušit</Dialog.Close><button className="button button--primary" type="submit"><FloppyDisk size={17} />Uložit šablonu</button></div></form></Dialog.Content></Dialog.Portal></Dialog.Root>
      <AlertDialog.Root open={confirmUpdateOpen} onOpenChange={setConfirmUpdateOpen}><AlertDialog.Portal><AlertDialog.Overlay className="dialog-overlay" /><AlertDialog.Content className="dialog-content"><AlertDialog.Title>Aktualizovat šablonu „{sourceTemplate?.name}“?</AlertDialog.Title><AlertDialog.Description>Nové rozložení se použije jen pro budoucí karty. Existující karty se nezmění.</AlertDialog.Description><div className="dialog-actions"><AlertDialog.Cancel className="button button--quiet">Zrušit</AlertDialog.Cancel><AlertDialog.Action className="button button--primary" onClick={() => void updateSourceTemplate()}>Aktualizovat šablonu</AlertDialog.Action></div></AlertDialog.Content></AlertDialog.Portal></AlertDialog.Root>
    </section>
  )
}
