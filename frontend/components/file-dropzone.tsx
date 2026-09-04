'use client'

import { useCallback, useRef, useState } from 'react'
import { FileText, Upload, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ClassificationTag } from './primitives'

export interface UploadedFile {
  id: string
  name: string
  sizeKb: number
  progress: number
  classification: string
}

export function FileDropzone({
  files,
  onFiles,
  onAddFiles,
  onRemove,
  disabled,
}: {
  files: UploadedFile[]
  onFiles?: (names: { name: string; sizeKb: number; file?: File }[]) => void
  onAddFiles?: (names: { name: string; sizeKb: number; file?: File }[]) => void
  onRemove: (id: string) => void
  disabled?: boolean
}) {
  const [drag, setDrag] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const handle = useCallback(
    (list: FileList | null) => {
      if (!list || disabled) return
      const arr = Array.from(list).map((f) => ({
        name: f.name,
        sizeKb: Math.max(1, Math.round(f.size / 1024)),
        file: f,
      }))
      if (onAddFiles) {
        onAddFiles(arr)
      } else if (onFiles) {
        onFiles(arr)
      }
    },
    [onFiles, onAddFiles, disabled],
  )

  return (
    <div className="flex flex-col gap-3">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          if (!disabled) setDrag(true)
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDrag(false)
          handle(e.dataTransfer.files)
        }}
        onClick={() => !disabled && inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !disabled && inputRef.current?.click()}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-2 border border-dashed px-6 py-8 text-center transition-colors',
          drag ? 'border-foreground bg-surface-sunken' : 'border-border-strong hover:bg-surface-sunken',
          disabled && 'cursor-not-allowed opacity-60 hover:bg-transparent',
        )}
      >
        <Upload className="h-4 w-4 text-foreground-muted" />
        <p className="text-[13px] text-foreground-secondary">
          Drag & drop task files, or <span className="text-foreground underline underline-offset-2">browse</span>
        </p>
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-foreground-muted">
          Stored locally · never leaves host
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          disabled={disabled}
          className="hidden"
          onChange={(e) => handle(e.target.files)}
        />
      </div>

      {files.length > 0 && (
        <ul className="flex flex-col divide-y divide-border border border-border">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-3 px-3.5 py-3">
              <FileText className="h-4 w-4 shrink-0 text-foreground-muted" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[13px] text-foreground">{f.name}</span>
                  {!disabled && (
                    <button
                      type="button"
                      onClick={() => onRemove(f.id)}
                      aria-label={`Remove ${f.name}`}
                      className="text-foreground-muted transition-colors hover:text-critical"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <div className="mt-1.5 flex items-center gap-3">
                  <span className="font-mono text-[10px] text-foreground-muted">{f.sizeKb} KB</span>
                  <ClassificationTag level={f.classification as any} />
                  {f.progress < 100 ? (
                    <span className="flex-1">
                      <span className="block h-px w-full bg-border">
                        <span
                          className="block h-px bg-active transition-all duration-300"
                          style={{ width: `${f.progress}%` }}
                        />
                      </span>
                    </span>
                  ) : (
                    <span className="font-mono text-[10px] text-sovereign">STORED</span>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
