'use client'

// Facet logo — faceted gem; solid stroke inherits the text color.
export function Logo({
  size = 20,
  className,
}: {
  size?: number
  className?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      strokeLinejoin="round"
      strokeLinecap="round"
      className={className}
      aria-hidden="true"
    >
      <g stroke="currentColor" strokeWidth="1.5">
        <path d="M12 3 L19.8 7.5 L19.8 16.5 L12 21 L4.2 16.5 L4.2 7.5 Z" />
        <path d="M12 3 L12 12" />
        <path d="M19.8 7.5 L12 12" />
        <path d="M19.8 16.5 L12 12" />
        <path d="M4.2 16.5 L12 12" />
        <path d="M4.2 7.5 L12 12" />
      </g>
    </svg>
  )
}
