/** Render a translated string, turning `**text**` into bold. Nothing else is parsed. */
export function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split('**').map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part))}
    </>
  )
}
