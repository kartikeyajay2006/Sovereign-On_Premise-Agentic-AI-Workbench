"use client";

/**
 * The request composer.
 *
 * Attachments are uploaded before submission so the analyzer can classify on
 * real file types, and so the operator sees the quarantine result before
 * committing work. The deliverable format is offered explicitly because
 * "produce a Word file" is a different instruction from "answer me".
 */

import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api, ApiError } from "@/lib/api";
import type { StoredFile } from "@/lib/types";
import { Button, Chip, classificationSignal, formatBytes } from "./primitives";

const FORMATS = [
  { value: "", label: "Answer only" },
  { value: "docx", label: "Word (.docx)" },
  { value: "xlsx", label: "Excel (.xlsx)" },
  { value: "pptx", label: "PowerPoint (.pptx)" },
  { value: "md", label: "Markdown (.md)" },
];

const EXAMPLES = [
  {
    label: "Approval note from a scan",
    prompt:
      "Analyze this scanned inspection report and prepare an approval note based on our approved SOP. Calculate the corrosion rate and remaining life for the governing location and state the severity classification.",
    format: "docx",
    needsFile: true,
  },
  {
    label: "Sandboxed calculation",
    prompt:
      "Write a python script that computes the corrosion rate and remaining life for a vessel with original thickness 12.0 mm, current thickness 9.4 mm measured 4.0 years apart, using a minimum allowable thickness of 6.0 mm. Print both results.",
    format: "",
    needsFile: false,
  },
  {
    label: "Read a drawing",
    prompt:
      "Read this scanned document and list every ultrasonic thickness reading you can see, with its location.",
    format: "",
    needsFile: true,
  },
];

export function Composer({
  onSubmitted,
  busy,
}: {
  onSubmitted: (taskId: string) => void;
  busy: boolean;
}) {
  const [prompt, setPrompt] = useState("");
  const [format, setFormat] = useState("");
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const attach = async (list: FileList | null) => {
    if (!list?.length) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(list)) {
        const stored = await api.upload(file, "confidential");
        setFiles((previous) => [...previous, stored]);
      }
    } catch (exc) {
      setError(exc instanceof ApiError ? exc.message : "Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const submit = async () => {
    if (!prompt.trim() || busy) return;
    setError(null);
    try {
      const task = await api.createTask(
        prompt.trim(),
        files.map((file) => file.id),
        format || null,
      );
      onSubmitted(task.id);
      setPrompt("");
      setFiles([]);
      setFormat("");
    } catch (exc) {
      setError(exc instanceof ApiError ? exc.message : "Could not start the task");
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void attach(event.dataTransfer.files);
        }}
        className={`readout transition-colors ${dragging ? "border-brass/70" : ""}`}
      >
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void submit();
          }}
          rows={4}
          placeholder="Describe the work. Attach a scan, drawing, spreadsheet or document if the task needs one."
          className="w-full resize-none bg-transparent px-3.5 py-3 text-[0.9375rem] leading-relaxed text-ink outline-none placeholder:text-ink-faint"
        />

        <AnimatePresence>
          {files.length > 0 && (
            <motion.ul
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="flex flex-wrap gap-1.5 border-t border-seam px-3.5 py-2"
            >
              {files.map((file) => (
                <li key={file.id}>
                  <Chip signal={classificationSignal(file.classification)}>
                    <span className="max-w-[220px] truncate">{file.filename}</span>
                    <span className="text-ink-faint">{formatBytes(file.size_bytes)}</span>
                    <button
                      onClick={() =>
                        setFiles((previous) => previous.filter((item) => item.id !== file.id))
                      }
                      className="ml-0.5 text-ink-faint transition-colors hover:text-alarm"
                      aria-label={`Remove ${file.filename}`}
                    >
                      ×
                    </button>
                  </Chip>
                </li>
              ))}
            </motion.ul>
          )}
        </AnimatePresence>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-seam px-3 py-2">
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="file"
              multiple
              onChange={(event) => void attach(event.target.files)}
              className="hidden"
              id="composer-files"
            />
            <Button
              variant="secondary"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? "Uploading" : "Attach files"}
            </Button>

            <label className="sr-only" htmlFor="composer-format">
              Deliverable format
            </label>
            <select
              id="composer-format"
              value={format}
              onChange={(event) => setFormat(event.target.value)}
              className="rounded-chip border border-seam bg-raised px-2.5 py-1.5 text-[0.8125rem] text-ink outline-none focus:border-brass/60"
            >
              {FORMATS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2.5">
            <span className="hidden text-[0.6875rem] text-ink-faint sm:inline">
              Ctrl + Enter to run
            </span>
            <Button onClick={() => void submit()} disabled={!prompt.trim() || busy}>
              {busy ? "Agent working" : "Run task"}
            </Button>
          </div>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-chip border border-alarm/40 bg-alarm/10 px-3 py-2 text-[0.8125rem] text-alarm"
        >
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[0.75rem] text-ink-faint">Try:</span>
        {EXAMPLES.map((example) => (
          <button
            key={example.label}
            onClick={() => {
              setPrompt(example.prompt);
              setFormat(example.format);
            }}
            className="rounded-chip border border-seam px-2.5 py-1 text-[0.75rem] text-ink-dim transition-colors hover:border-brass/50 hover:text-brass"
            title={example.needsFile ? "Attach the sample scan for this one" : undefined}
          >
            {example.label}
          </button>
        ))}
      </div>
    </div>
  );
}
