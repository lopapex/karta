import { ArrowDown, ArrowUp, Plus, Trash } from '@phosphor-icons/react'
import { UiSelect } from './UiSelect'
import type { CardField, FieldType } from '../domain/types'

const fieldTypes: Array<{ value: FieldType; label: string }> = [
  { value: 'text', label: 'Krátký text' }, { value: 'textarea', label: 'Dlouhý text' },
  { value: 'number', label: 'Číslo' }, { value: 'date', label: 'Datum' },
  { value: 'checkbox', label: 'Zaškrtávací pole' }, { value: 'select', label: 'Výběr z možností' },
  { value: 'email', label: 'E-mail' }, { value: 'phone', label: 'Telefon' },
]

interface Props {
  fields: CardField[]
  onChange: (fields: CardField[]) => void
}

export function FieldLayoutEditor({ fields, onChange }: Props) {
  function update(index: number, patch: Partial<CardField>) {
    onChange(fields.map((field, current) => current === index ? { ...field, ...patch } : field))
  }
  function addField() {
    onChange([...fields, { id: crypto.randomUUID(), label: '', fieldType: 'text', required: false, options: [] }])
  }
  function move(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= fields.length) return
    const next = [...fields]
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }
  return (
    <>
      <div className="section-heading">
        <div><h2>Pole šablony</h2></div>
        <button className="button button--secondary" type="button" onClick={addField}><Plus size={17} />Přidat pole</button>
      </div>
      {fields.length === 0 ? <div className="empty-inline">Rozložení zatím nemá žádná pole.</div> : null}
      <div className="field-builder-list">
        {fields.map((field, index) => (
          <fieldset className="field-builder" key={field.id}>
            <legend>Pole {index + 1}</legend>
            <div className="field-builder-actions">
              <button className="icon-button" type="button" disabled={index === 0} aria-label="Posunout pole nahoru" onClick={() => move(index, -1)}><ArrowUp size={16} /></button>
              <button className="icon-button" type="button" disabled={index === fields.length - 1} aria-label="Posunout pole dolů" onClick={() => move(index, 1)}><ArrowDown size={16} /></button>
              <button className="icon-button icon-button--danger" type="button" aria-label={`Odebrat pole ${index + 1}`} onClick={() => onChange(fields.filter((_, current) => current !== index))}><Trash size={17} /></button>
            </div>
            <div className="field-builder-grid">
              <label className="field-label">Název pole<input className="text-input" value={field.label} maxLength={120} required onChange={(event) => update(index, { label: event.target.value })} /></label>
              <div className="field-label"><span>Typ pole</span><UiSelect ariaLabel={`Typ pole ${index + 1}`} value={field.fieldType} onValueChange={(value) => update(index, { fieldType: value as FieldType, options: value === 'select' ? [{ id: crypto.randomUUID(), label: '' }] : [], value: undefined })} options={fieldTypes} /></div>
              <label className="checkbox-field"><input type="checkbox" checked={field.required} onChange={(event) => update(index, { required: event.target.checked })} /><span>Povinné pole</span></label>
            </div>
            {field.fieldType === 'select' ? (
              <div className="option-editor">
                <div className="option-editor-heading"><span>Možnosti výběru</span><button className="button button--quiet" type="button" onClick={() => update(index, { options: [...field.options, { id: crypto.randomUUID(), label: '' }] })}><Plus size={16} />Přidat možnost</button></div>
                {field.options.map((option, optionIndex) => (
                  <div className="option-row" key={option.id}>
                    <input className="text-input" value={option.label} required maxLength={120} aria-label={`Možnost ${optionIndex + 1}`} onChange={(event) => update(index, { options: field.options.map((item, current) => current === optionIndex ? { ...item, label: event.target.value } : item) })} />
                    <button className="icon-button" type="button" disabled={field.options.length === 1} aria-label="Odebrat možnost" onClick={() => update(index, { options: field.options.filter((_, current) => current !== optionIndex), value: undefined })}><Trash size={16} /></button>
                  </div>
                ))}
              </div>
            ) : null}
          </fieldset>
        ))}
      </div>
    </>
  )
}
