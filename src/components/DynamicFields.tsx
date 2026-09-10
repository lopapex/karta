import { Controller, type Control, type FieldValues, type Path } from 'react-hook-form'
import type { CardField } from '../domain/types'
import { UiSelect } from './UiSelect'
import { Trash } from '@phosphor-icons/react'

interface DynamicFieldsProps<T extends FieldValues> {
  fields: CardField[]
  control: Control<T>
  nameFor: (field: CardField) => Path<T>
  onRemove?: (field: CardField) => void
}

export function DynamicFields<T extends FieldValues>({ fields, control, nameFor, onRemove }: DynamicFieldsProps<T>) {
  if (fields.length === 0) {
    return <p className="muted-copy">Zatím nejsou přidané žádné další údaje.</p>
  }

  return (
    <div className="dynamic-fields">
      {fields.map((field) => (
        <Controller
          key={field.id}
          name={nameFor(field)}
          control={control}
          defaultValue={(field.value ?? (field.fieldType === 'checkbox' ? false : '')) as never}
          rules={{ required: field.required ? 'Toto pole je povinné.' : false }}
          render={({ field: formField, fieldState }) => (
            <div className={`dynamic-field${field.isCustom ? ' dynamic-field--custom' : ''}${field.fieldType === 'textarea' ? ' dynamic-field--wide' : ''}`}>
            <label className={`field-label${field.fieldType === 'checkbox' ? ' checkbox-field' : ''}`}>
              {field.fieldType === 'checkbox' ? (
                <>
                  <input type="checkbox" checked={Boolean(formField.value)} onChange={formField.onChange} />
                  <span>{field.label}</span>
                </>
              ) : (
                <>
                  <span>{field.label}{field.required ? ' *' : ''}</span>
                  {field.fieldType === 'textarea' ? (
                    <textarea className="text-input textarea" {...formField} value={String(formField.value ?? '')} />
                  ) : field.fieldType === 'select' ? (
                    <UiSelect
                      ariaLabel={field.label}
                      value={String(formField.value ?? '') || undefined}
                      placeholder="Vyberte možnost"
                      onValueChange={formField.onChange}
                      options={field.options.map((option) => ({ value: option.id, label: option.label }))}
                    />
                  ) : (
                    <input
                      className="text-input"
                      type={field.fieldType === 'phone' ? 'tel' : field.fieldType}
                      {...formField}
                      value={String(formField.value ?? '')}
                      onChange={(event) =>
                        formField.onChange(
                          field.fieldType === 'number' && event.target.value !== ''
                            ? Number(event.target.value)
                            : event.target.value,
                        )
                      }
                    />
                  )}
                </>
              )}
              {fieldState.error ? <span className="field-error">{fieldState.error.message}</span> : null}
            </label>
            {field.isCustom && onRemove ? <button className="icon-button icon-button--danger dynamic-field-remove" type="button" aria-label={`Odebrat vlastní pole ${field.label}`} title="Odebrat vlastní pole" onClick={() => onRemove(field)}><Trash size={17} /></button> : null}
            </div>
          )}
        />
      ))}
    </div>
  )
}
