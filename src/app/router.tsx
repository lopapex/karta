import { Navigate, Route, Routes } from 'react-router'
import { AppShell } from '../components/AppShell'
import { ClientsPage } from '../pages/ClientsPage'
import { ClientDetailPage } from '../pages/ClientDetailPage'
import { ClientFormPage } from '../pages/ClientFormPage'
import { SettingsPage } from '../pages/SettingsPage'
import { TemplateFormPage } from '../pages/TemplateFormPage'
import { TemplatesPage } from '../pages/TemplatesPage'

export function AppRouter() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/clients" element={<ClientsPage />} />
        <Route path="/clients/new" element={<ClientFormPage />} />
        <Route path="/clients/:id" element={<ClientDetailPage />} />
        <Route path="/clients/:id/edit" element={<ClientFormPage />} />
        <Route path="/templates" element={<TemplatesPage />} />
        <Route path="/templates/new" element={<TemplateFormPage />} />
        <Route path="/templates/:id/edit" element={<TemplateFormPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/clients" replace />} />
    </Routes>
  )
}
