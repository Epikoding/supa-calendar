import html2canvas from 'html2canvas-pro'

interface ExportPngOptions {
  chartElement: HTMLElement
  includeScenarios: boolean
  fileName: string
  /** 날짜 범위 크롭 (타임라인 CSS 픽셀 기준) */
  crop?: {
    startX: number
    endX: number
  }
}

/** 요소의 인라인 스타일을 저장 → 덮어쓰기 → 복원 함수 반환 */
function overrideStyles(el: HTMLElement, overrides: Record<string, string>): () => void {
  const saved: Record<string, string> = {}
  for (const [k, v] of Object.entries(overrides)) {
    saved[k] = el.style.getPropertyValue(k)
    el.style.setProperty(k, v)
  }
  return () => {
    for (const [k, v] of Object.entries(saved)) {
      if (v) el.style.setProperty(k, v)
      else el.style.removeProperty(k)
    }
  }
}

/** canvas → Blob → 다운로드 */
function downloadCanvasAsPng(canvas: HTMLCanvasElement, fileName: string): Promise<void> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) { resolve(); return }
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.download = fileName
      link.href = url
      link.click()
      setTimeout(() => { URL.revokeObjectURL(url); resolve() }, 200)
    }, 'image/png')
  })
}

export async function exportGanttPng({
  chartElement,
  includeScenarios,
  fileName,
  crop,
}: ExportPngOptions): Promise<void> {
  // 시나리오 라인 숨김 처리
  const scenarioEls = includeScenarios
    ? []
    : Array.from(chartElement.querySelectorAll<HTMLElement>('[data-scenario-line]'))
  for (const el of scenarioEls) el.style.display = 'none'

  const restores: (() => void)[] = []

  try {
    const scrollContainer = chartElement.querySelector('.overflow-auto') as HTMLElement | null
    const glassPanel = chartElement.querySelector('.overflow-y-auto') as HTMLElement | null
    if (!scrollContainer || !glassPanel) return

    const timelineContent = scrollContainer.querySelector(':scope > .relative') as HTMLElement | null
    if (!timelineContent) return

    const fullHeight = timelineContent.scrollHeight

    // 부모 체인 overflow 해제
    if (chartElement.parentElement) {
      restores.push(overrideStyles(chartElement.parentElement, { overflow: 'visible' }))
    }
    restores.push(overrideStyles(chartElement, { overflow: 'visible' }))
    restores.push(overrideStyles(scrollContainer, { overflow: 'visible' }))
    restores.push(overrideStyles(glassPanel, { overflow: 'visible', height: `${fullHeight}px` }))

    // 타임라인 캡처 영역 계산
    const captureX = crop ? crop.startX : 0
    const captureW = crop ? (crop.endX - crop.startX) : timelineContent.scrollWidth

    const scale = 2

    // 좌측 패널 캡처
    const leftCanvas = await html2canvas(glassPanel, { scale, useCORS: true })

    // 타임라인 캡처 (필요한 영역만 — x, width 옵션으로 범위 제한)
    const rightCanvas = await html2canvas(timelineContent, {
      scale,
      useCORS: true,
      x: captureX,
      width: captureW,
    })

    // 합성
    const combined = document.createElement('canvas')
    combined.width = leftCanvas.width + rightCanvas.width
    combined.height = Math.max(leftCanvas.height, rightCanvas.height)
    const ctx = combined.getContext('2d')!
    ctx.drawImage(leftCanvas, 0, 0)
    ctx.drawImage(rightCanvas, leftCanvas.width, 0)

    // 다운로드
    await downloadCanvasAsPng(combined, fileName)
  } finally {
    // 스타일 복원 (역순)
    for (let i = restores.length - 1; i >= 0; i--) restores[i]()
    // 시나리오 라인 복원
    for (const el of scenarioEls) el.style.display = ''
  }
}
