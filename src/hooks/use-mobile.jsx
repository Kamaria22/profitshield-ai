import * as React from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const touchMql = window.matchMedia('(pointer: coarse)')
    const onChange = () => {
      const shortestSide = Math.min(window.innerWidth, window.innerHeight)
      const coarseTouch = touchMql.matches
      setIsMobile(shortestSide < MOBILE_BREAKPOINT || (coarseTouch && shortestSide <= 1024))
    }
    mql.addEventListener("change", onChange)
    touchMql.addEventListener("change", onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    onChange()
    return () => {
      mql.removeEventListener("change", onChange);
      touchMql.removeEventListener("change", onChange);
    };
  }, [])

  return !!isMobile
}
