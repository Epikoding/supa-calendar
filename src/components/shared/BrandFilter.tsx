'use client'

import { useRef, useState } from 'react'
import { useClickOutside } from '@/hooks/useClickOutside'
import {
  GLASS_DROPDOWN_STYLE,
  GLASS_NAV_BTN_STYLE,
  PILL_ACTIVE_STYLE,
  DROPDOWN_ITEM_INACTIVE_STYLE,
} from '@/lib/styles/toolbar'
import { BRAND_LABEL } from '@/lib/config'

interface BrandFilterProps {
  brands: { id: number; code: string; color: string | null }[]
  value: number[] | null
  onChange: (next: number[] | null) => void
  label?: string
}

export default function BrandFilter({ brands, value, onChange, label = BRAND_LABEL }: BrandFilterProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useClickOutside(ref, open, () => setOpen(false))

  const isAll = !value || value.length === 0
  const selectedLabel = isAll
    ? '전체'
    : brands.filter((b) => value!.includes(b.id)).map((b) => b.code).join(', ')

  const toggleBrand = (brandId: number) => {
    const current = value ?? []
    const next = current.includes(brandId)
      ? current.filter((id) => id !== brandId)
      : [...current, brandId]
    onChange(next.length > 0 ? next : null)
  }

  return (
    <div className="relative flex items-center gap-1.5" ref={ref}>
      <span className="text-xs text-gray-500 mr-0.5">{label}</span>
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-sm rounded-lg px-2 py-1 text-gray-900 transition-all flex items-center gap-1 min-w-[80px]"
        style={GLASS_NAV_BTN_STYLE}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate max-w-[120px]">{selectedLabel}</span>
        <span className="text-[10px] text-gray-400 ml-auto">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div
          className="absolute top-full left-0 mt-1 rounded-xl z-50 py-2 px-2 flex flex-wrap gap-1.5"
          style={{ ...GLASS_DROPDOWN_STYLE, minWidth: 180 }}
          role="listbox"
        >
          <button
            onClick={() => onChange(null)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
              isAll ? 'text-white' : 'text-gray-400'
            }`}
            style={isAll ? PILL_ACTIVE_STYLE : DROPDOWN_ITEM_INACTIVE_STYLE}
            aria-pressed={isAll}
          >
            전체
          </button>
          {brands.map((brand) => {
            const active = value?.includes(brand.id) ?? false
            return (
              <button
                key={brand.id}
                onClick={() => toggleBrand(brand.id)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                  active ? 'text-white' : 'text-gray-400'
                }`}
                style={active
                  ? { backgroundColor: brand.color || '#374151', boxShadow: `0 2px 6px ${brand.color || '#374151'}33` }
                  : DROPDOWN_ITEM_INACTIVE_STYLE
                }
                aria-pressed={active}
              >
                {brand.code}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
