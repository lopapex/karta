import { invoke } from '@tauri-apps/api/core'
import type {
  CardField,
  ClientRecord,
  ClientSummary,
  CommandError,
  SecurityStatus,
  TemplateInput,
  TemplateRecord,
  TemplateSummary,
  VisitRecord,
  VisitSummary,
} from './types'

async function call<T>(command: string, args?: Record<string, unknown>) {
  try {
    return await invoke<T>(command, args)
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'message' in error &&
      typeof error.message === 'string'
    ) {
      throw error as CommandError
    }
    throw { code: 'unknown_error', message: 'Operaci se nepodařilo dokončit.' }
  }
}

export const api = {
  securityStatus: () => call<SecurityStatus>('get_security_status'),
  initialize: (password: string) =>
    call<SecurityStatus>('initialize_secure_storage', { input: { password } }),
  unlock: (password: string) =>
    call<SecurityStatus>('unlock_database', { input: { password } }),
  changePassword: (currentPassword: string, newPassword: string) =>
    call<SecurityStatus>('change_password', { input: { currentPassword, newPassword } }),
  listClients: (query = '', archived = false) =>
    call<ClientSummary[]>('list_clients', { input: { query, archived } }),
  getClient: (id: string) => call<ClientRecord>('get_client', { id }),
  createClient: (title: string, templateId: string, fields: CardField[]) =>
    call<ClientRecord>('create_client', {
      input: { title, templateId, fields },
    }),
  updateClient: (id: string, title: string, fields: CardField[]) =>
    call<ClientRecord>('update_client', { id, input: { title, fields } }),
  archiveClient: (id: string) => call<void>('archive_client', { id }),
  restoreClient: (id: string) => call<void>('restore_client', { id }),
  deleteClient: (id: string, confirmation: string) => call<void>('delete_client', { id, confirmation }),
  listTemplates: () => call<TemplateSummary[]>('list_templates'),
  getTemplate: (id: string) => call<TemplateRecord>('get_template', { id }),
  createTemplate: (input: TemplateInput) =>
    call<TemplateRecord>('create_template', { input }),
  updateTemplate: (id: string, input: TemplateInput) =>
    call<TemplateRecord>('update_template', { id, input }),
  deleteTemplate: (id: string) => call<void>('delete_template', { id }),
  setDefaultTemplate: (id: string) => call<void>('set_default_template', { id }),
  listVisits: (clientId: string) => call<VisitSummary[]>('list_visits', { clientId }),
  getVisit: (clientId: string, id: string) => call<VisitRecord>('get_visit', { clientId, id }),
  createVisit: (clientId: string, visitDate: string, notes: string) =>
    call<VisitRecord>('create_visit', { clientId, input: { visitDate, notes } }),
  updateVisit: (clientId: string, id: string, visitDate: string, notes: string) =>
    call<VisitRecord>('update_visit', { clientId, id, input: { visitDate, notes } }),
  deleteVisit: (clientId: string, id: string) => call<void>('delete_visit', { clientId, id }),
  exportDatabase: (password: string) =>
    call<{ fileName: string }>('export_database', { input: { password } }),
  importDatabase: (password: string, appPassword?: string, newAppPassword?: string) =>
    call<{ fileName: string }>('import_database', {
      input: { password, appPassword, newAppPassword },
    }),
}

export function errorMessage(error: unknown) {
  return typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
    ? error.message
    : 'Operaci se nepodařilo dokončit.'
}
