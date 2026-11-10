import z from '@deepseek-ai/schemastery'

export const Config = z.object({
  fixOverflow: z.boolean().default(true)
    .description('Apply the built-in fix that keeps the whole page from scrolling (for example after a reconnect) by clipping html and body to the window.'),
  css: z.string().role('textarea').default('')
    .description('Your own CSS, applied to the whole Web UI after the built-in fix. Reload the page after changing it.'),
})
