import { type ReactNode, useEffect, useRef } from 'react'

// Every device photo is cropped to W×H (stored at 2x) and scaled to its stage.
const W = 600
const H = 540

// Each screen is laid out at w×h; `fit` maps that box onto the display's
// corners as measured in the photo.
const SCREENS = {
  tablet: {
    w: 384,
    h: 490,
    fit: 'matrix3d(0.866196,-0.000829943,0,8.77758e-05,-0.00659638,0.811273,0,-0.000131349,0,0,1,0,127.597,55.8387,0,1)',
  },
  tv: {
    w: 640,
    h: 360,
    fit: 'matrix3d(0.816303,-0.00235237,0,5.10657e-06,0.00427762,0.820671,0,7.63126e-06,0,0,1,0,39.9366,123.138,0,1)',
  },
  phone: {
    w: 288,
    h: 624,
    fit: 'matrix3d(0.754362,-0.00153368,0,1.09302e-05,0.00243789,0.747894,0,-1.02516e-05,0,0,1,0,190.083,35.2617,0,1)',
  },
} as const

/** Holds device photos and scales them to its own width. */
export function DeviceStage({
  className,
  children,
}: {
  className: string
  children: ReactNode
}) {
  const stage = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = stage.current
    if (!el) return
    const ro = new ResizeObserver(() =>
      el.style.setProperty('--fit', String(el.clientWidth / W)),
    )
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <div
      ref={stage}
      aria-hidden
      className={className}
      style={{ aspectRatio: `${W} / ${H}` }}
    >
      {children}
    </div>
  )
}

/** A real device photo with the product's own screen fitted onto its display. */
export function Device({
  kind,
  className,
  children,
}: {
  kind: keyof typeof SCREENS
  /** Classes for the screen: its colour and corner radius. */
  className: string
  children: ReactNode
}) {
  const screen = SCREENS[kind]
  return (
    <div
      className="relative origin-top-left [scale:var(--fit,1)]"
      style={{ width: W, height: H }}
    >
      <img
        src={`/site/device-${kind}.webp`}
        alt=""
        width={W}
        height={H}
        loading="lazy"
        className="absolute inset-0 size-full"
      />
      <div
        className={`absolute top-0 left-0 origin-top-left overflow-hidden ${className}`}
        style={{ width: screen.w, height: screen.h, transform: screen.fit }}
      >
        {children}
      </div>
    </div>
  )
}
