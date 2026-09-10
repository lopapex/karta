export type SecurityState =
  | 'needsInitialization'
  | 'needsPasswordMigration'
  | 'locked'
  | 'unlocked'
  | 'inconsistent'

export interface SecurityStatus {
  state: SecurityState
}

export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'date'
  | 'checkbox'
  | 'select'
  | 'email'
  | 'phone'

export interface SelectOption {
  id: string
  label: string
}

export interface CardField {
  id: string
  label: string
  fieldType: FieldType
  required: boolean
  options: SelectOption[]
  isCustom?: boolean
  value?: unknown
}

export interface TemplateInput {
  name: string
  description: string
  fields: CardField[]
}

export interface TemplateSummary {
  id: string
  name: string
  description: string
  fieldCount: number
  fieldLabels: string[]
  updatedAt: string
  isDefault: boolean
}

export interface TemplateRecord extends TemplateInput {
  id: string
  createdAt: string
  updatedAt: string
  isDefault: boolean
}

export interface ClientSummary {
  id: string
  title: string
  archivedAt: string | null
  updatedAt: string
}

export interface ClientRecord {
  id: string
  title: string
  sourceTemplateId: string | null
  fields: CardField[]
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface VisitSummary {
  id: string
  clientId: string
  visitDate: string
  notesPreview: string
  createdAt: string
  updatedAt: string
}

export interface VisitRecord {
  id: string
  clientId: string
  visitDate: string
  notes: string
  createdAt: string
  updatedAt: string
}

export interface CommandError {
  code: string
  message: string
}
