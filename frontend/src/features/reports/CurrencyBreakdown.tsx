const CURRENCY_SYMBOLS: Record<string, string> = {
  GBP: '£', EUR: '€', USD: '$', AUD: 'A$', CAD: 'C$', JPY: '¥',
}

export interface CurrencyBreakdownItem {
  currency: string
  amount: number
  converted_amount: number
  rate: number
}

export function CurrencyBreakdownAnnotation({ breakdown }: { breakdown?: CurrencyBreakdownItem[] | null }) {
  if (!breakdown) return null
  const foreign = breakdown.filter(b => b.currency !== 'GBP')
  if (foreign.length === 0) return null

  return (
    <div className="mt-1 space-y-0.5">
      {foreign.map(b => {
        const sym = CURRENCY_SYMBOLS[b.currency] || b.currency + ' '
        return (
          <p key={b.currency} className="text-[10px] text-muted-foreground/70 leading-tight">
            Includes {sym}{(b.amount / 100).toLocaleString('en-GB', { minimumFractionDigits: 2 })} {b.currency}
            {' → '}
            £{(b.converted_amount / 100).toLocaleString('en-GB', { minimumFractionDigits: 2 })} GBP
          </p>
        )
      })}
    </div>
  )
}
