import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'

export function Sheet({ open, onOpenChange, title, description, children }:
  { open: boolean; onOpenChange: (o: boolean) => void; title: string; description: string; children: ReactNode }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="sheet-overlay" />
        <Dialog.Content className="sheet-panel">
          <div className="flex items-start gap-4 px-6 pb-4 pt-6">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-[1.5rem] font-extrabold tracking-[-0.03em]">{title}</Dialog.Title>
              <Dialog.Description className="mt-1 text-[0.95rem] text-text-2">{description}</Dialog.Description>
            </div>
            <Dialog.Close className="btn btn-quiet" aria-label="Close"><X size={18} aria-hidden="true" /></Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-8">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
