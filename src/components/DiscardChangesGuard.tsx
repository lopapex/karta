import * as AlertDialog from '@radix-ui/react-alert-dialog'
import { useEffect, useRef, useState } from 'react'

export function useDiscardChanges(dirty: boolean) {
  const [open, setOpen] = useState(false)
  const pendingAction = useRef<(() => void) | null>(null)
  useEffect(() => {
    const preventUnload = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault() }
    window.addEventListener('beforeunload', preventUnload)
    return () => window.removeEventListener('beforeunload', preventUnload)
  }, [dirty])
  function request(action: () => void) { if (!dirty) action(); else { pendingAction.current = action; setOpen(true) } }
  const dialog = <AlertDialog.Root open={open} onOpenChange={setOpen}><AlertDialog.Portal><AlertDialog.Overlay className="dialog-overlay" /><AlertDialog.Content className="dialog-content"><AlertDialog.Title>Zahodit neuložené změny?</AlertDialog.Title><AlertDialog.Description>Provedené změny se neuloží.</AlertDialog.Description><div className="dialog-actions"><AlertDialog.Cancel className="button button--quiet">Pokračovat v úpravách</AlertDialog.Cancel><AlertDialog.Action className="button button--danger" onClick={() => { pendingAction.current?.(); pendingAction.current = null }}>Zahodit změny</AlertDialog.Action></div></AlertDialog.Content></AlertDialog.Portal></AlertDialog.Root>
  return { request, dialog }
}
