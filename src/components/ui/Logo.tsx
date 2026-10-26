/**
 * SteadFi logo — from the "SteadFi Logo concept" brand sheet: a rounded tile
 * holding a single-stroke "S" (round caps), Steady Navy #0F172A and Ledger
 * Green #10B981, wordmark in Space Grotesk SemiBold at −4.5% tracking.
 * The stroke thickens at 32px and below so the mark stays legible.
 */

export const BRAND = { navy: '#0F172A', green: '#10B981', paper: '#F8FAFC' } as const

/** The S as one stroked path on a 256 grid (top bar → left bowl → middle → right bowl → bottom bar). */
const S_PATH = 'M184 64H104a32 32 0 0 0 0 64h48a32 32 0 0 1 0 64H72'

type Tone = 'green' | 'navy'

/** Rounded tile mark. `green` = green tile + navy S (for dark UI), `navy` = navy tile + green S (for light UI). */
export function LogoMark({ size = 28, tone = 'green' }: { size?: number; tone?: Tone }) {
  const tile = tone === 'green' ? BRAND.green : BRAND.navy
  const stroke = tone === 'green' ? BRAND.navy : BRAND.green
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" fill="none" aria-hidden="true">
      <rect width="256" height="256" rx="58" fill={tile} />
      <path d={S_PATH} stroke={stroke} strokeWidth={size <= 32 ? 40 : 32} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function Logo({ size = 28, tone = 'green' }: { size?: number; tone?: Tone }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark size={size} tone={tone} />
      <span
        className="font-semibold"
        style={{ fontFamily: "'Space Grotesk', var(--font-heading)", letterSpacing: '-0.045em', fontSize: size * 0.68 }}
      >
        SteadFi
      </span>
    </span>
  )
}
