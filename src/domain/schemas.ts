import { z } from 'zod'

export const templateSchema = z.object({
  name: z.string().trim().min(1, 'Zadejte název šablony.').max(160),
  description: z.string().trim().max(2_000),
  fields: z
    .array(
      z.object({
        id: z.uuid(),
        label: z.string().trim().min(1, 'Zadejte název pole.').max(120),
        fieldType: z.enum([
          'text',
          'textarea',
          'number',
          'date',
          'checkbox',
          'select',
          'email',
          'phone',
        ]),
        required: z.boolean(),
        options: z.array(
          z.object({ id: z.uuid(), label: z.string().trim().min(1).max(120) }),
        ),
        value: z.unknown().optional(),
      }),
    )
    .max(100),
})

export const backupPasswordSchema = z
  .string()
  .min(12, 'Heslo zálohy musí mít alespoň 12 znaků.')
  .max(256)

export const appPasswordSchema = z
  .string()
  .min(6, 'Heslo KARTA musí mít alespoň 6 znaků.')
  .max(64, 'Heslo KARTA může mít nejvýše 64 znaků.')
