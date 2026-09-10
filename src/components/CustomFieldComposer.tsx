import { Check, Plus, Trash, X } from '@phosphor-icons/react'
import { useState } from 'react'
import type { CardField, FieldType } from '../domain/types'
import { UiSelect } from './UiSelect'

const fieldTypes: Array<{ value: FieldType; label: string }> = [
  { value: 'text', label: 'Krátký text' }, { value: 'textarea', label: 'Dlouhý text' },
  { value: 'number', label: 'Číslo' }, { value: 'date', label: 'Datum' },
  { value: 'checkbox', label: 'Zaškrtávací pole' }, { value: 'select', label: 'Výběr z možností' },
  { value: 'email', label: 'E-mail' }, { value: 'phone', label: 'Telefon' },
]

interface Props { onDone: (field: CardField) => void }

function newField(): CardField {
  return { id: crypto.randomUUID(), label: '', fieldType: 'text', required: false, options: [], isCustom: true }
}

export function CustomFieldComposer({ onDone }: Props) {
  const [draft, setDraft] = useState<CardField | null>(null)
  const [error, setError] = useState('')

  function update(patch: Partial<CardField>) { setDraft((current) => current ? { ...current, ...patch } : current) }
  function finish() {
    if (!draft?.label.trim()) { setError('Zadejte název pole.'); return }
    if (draft.fieldType === 'select' && (draft.options.length === 0 || draft.options.some((option) => !option.label.trim()))) {
      setError('Vyplňte alespoň jednu možnost výběru.'); return
    }
    onDone({ ...draft, label: draft.label.trim(), value: draft.fieldType === 'checkbox' ? false : '' })
    setDraft(null)
    setError('')
  }

  if (!draft) return <button className="button button--secondary add-custom-field" type="button" onClick={() => setDraft(newField())}><Plus size={17} />Přidat vlastní pole</button>
  return (
    <fieldset className="field-builder custom-field-composer">
      <legend>Nové vlastní pole</legend>
      <div className="field-builder-grid">
        <label className="field-label">Název pole<input className="text-input" value={draft.label} autoFocus maxLength={120} onChange={(event) => update({ label: event.target.value })} /></label>
        <div className="field-label"><span>Typ pole</span><UiSelect ariaLabel="Typ vlastního pole" value={draft.fieldType} onValueChange={(value) => update({ fieldType: value as FieldType, options: value === 'select' ? [{ id: crypto.randomUUID(), label: '' }] : [], value: undefined })} options={fieldTypes} /></div>
        <label className="checkbox-field"><input type="checkbox" checked={draft.required} onChange={(event) => update({ required: event.target.checked })} /><span>Povinné pole</span></label>
      </div>
      {draft.fieldType === 'select' ? <div className="option-editor">
        <div className="option-editor-heading"><span>Možnosti výběru</span><button className="button button--quiet" type="button" onClick={() => update({ options: [...draft.options, { id: crypto.randomUUID(), label: '' }] })}><Plus size={16} />Přidat možnost</button></div>
        {draft.options.map((option, index) => <div className="option-row" key={option.id}><input className="text-input" value={option.label} maxLength={120} aria-label={`Možnost ${index + 1}`} onChange={(event) => update({ options: draft.options.map((item, current) => current === index ? { ...item, label: event.target.value } : item) })} /><button className="icon-button" type="button" disabled={draft.options.length === 1} aria-label="Odebrat možnost" onClick={() => update({ options: draft.options.filter((_, current) => current !== index) })}><Trash size={16} /></button></div>)}
      </div> : null}
      {error ? <p className="field-error" role="alert">{error}</p> : null}
      <div className="custom-field-actions"><button className="button button--quiet" type="button" onClick={() => { setDraft(null); setError('') }}><X size={16} />Zrušit</button><button className="button button--primary" type="button" onClick={finish}><Check size={17} />Hotovo</button></div>
    </fieldset>
  )
}
