/**
 * §8.5's back chevron, above the screen title: back to the circles list.
 *
 * Drawn, not typed. The arrow character it replaces, set at label size, read
 * as a speck on a real phone, and its tap target was 13px tall. The row is now
 * a full 44px target, pulled into the page's top padding so the title does not
 * move, and the chevron's stroke lines up with the page edge.
 */
import { useI18n } from '../lib/i18n'
import { link } from '../lib/identity'

export function Back() {
  const { t } = useI18n()
  return (
    // Block-level, not inline-flex: an inline box takes the line's extra leading
    // too, and pushed the title 17px down. The top margin keeps the label exactly
    // where the old link's label sat.
    <a href={link()} className="-ml-[7px] -mt-[15px] flex min-h-11 w-fit items-center gap-1 pr-3 text-cream">
      <svg
        viewBox="0 0 24 24"
        width="24"
        height="24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="shrink-0"
      >
        <path d="M15 5l-7 7 7 7" />
      </svg>
      <span className="label">{t.word.circles}</span>
    </a>
  )
}
