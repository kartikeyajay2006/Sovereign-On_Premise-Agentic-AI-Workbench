"use client";

/**
 * Registry: the documents this host holds.
 *
 * Two stores, deliberately distinguished. Attachments are working material
 * for a single task. Knowledge-base documents are the organisation's
 * authority — the SOPs and manuals answers get grounded in — so they carry a
 * department, a revision and a classification, and searching them shows
 * exactly what a retrieval would return.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { api, ApiError } from "@/lib/api";
import type { EvidenceItem, KnowledgeDocument, StoredFile, User } from "@/lib/types";
import { Shell } from "@/components/Shell";
import {
  Button,
  Chip,
  EmptyState,
  Panel,
  classificationSignal,
  formatBytes,
  formatDateTime,
} from "@/components/primitives";

const DEPARTMENTS = [
  "inspection",
  "engineering",
  "operations",
  "quality",
  "finance",
  "general",
];
const LEVELS = ["normal", "confidential", "sensitive", "restricted"];

export default function LibraryPage() {
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<EvidenceItem[] | null>(null);
  const [mode, setMode] = useState<string | null>(null);
  const [tookMs, setTookMs] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [department, setDepartment] = useState("inspection");
  const [classification, setClassification] = useState("confidential");
  const ingestRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const [documentList, fileList] = await Promise.all([
      api.knowledgeDocuments().catch(() => []),
      api.listFiles().catch(() => []),
    ]);
    setDocuments(documentList);
    setFiles(fileList);
  }, []);

  useEffect(() => {
    void load();
    api
      .me()
      .then(setUser)
      .catch(() => setUser(null));
  }, [load]);

  const search = async () => {
    if (!query.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const response = await api.knowledgeSearch(query.trim());
      setResults(response.results);
      setMode(response.retrieval_mode);
      setTookMs(response.took_ms);
    } catch (exc) {
      setError(exc instanceof ApiError ? exc.message : "Search failed");
    } finally {
      setBusy(false);
    }
  };

  const ingest = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true);
    setError(null);
    try {
      for (const file of Array.from(list)) {
        await api.ingest(file, department, classification, "1.0");
      }
      await load();
    } catch (exc) {
      setError(exc instanceof ApiError ? exc.message : "Ingestion failed");
    } finally {
      setBusy(false);
      if (ingestRef.current) ingestRef.current.value = "";
    }
  };

  const canIngest = user?.permissions.includes("knowledge.ingest");
  const canManage = user?.permissions.includes("knowledge.manage");

  return (
    <Shell>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-[1180px] space-y-4 p-5">
          <div>
            <h1 className="text-[1.5rem] font-semibold tracking-tight text-ink">Library</h1>
            <p className="mt-1.5 max-w-[70ch] text-[0.9375rem] leading-relaxed text-ink-dim">
              Add the procedures and manuals your organisation actually works to. The
              workbench searches them when answering, and every claim it makes points
              back to the document and section it came from.
            </p>
          </div>

          {/* -------------------------------------------------- search */}
          <Panel
            title="Search your reference documents"
            action={
              mode && (
                <span className="instrument text-[0.6875rem] text-ink-faint">
                  {mode} · {tookMs} ms
                </span>
              )
            }
          >
            <div className="flex gap-2">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void search();
                }}
                placeholder="How is remaining life calculated? What severity applies to coating breakdown?"
                className="readout flex-1 px-3 py-2 text-[0.875rem] text-ink outline-none focus:border-brass/60"
              />
              <Button onClick={() => void search()} disabled={busy || !query.trim()}>
                Search
              </Button>
            </div>

            {results && (
              <ul className="mt-3 space-y-2">
                {results.length === 0 && (
                  <li className="text-[0.8125rem] text-ink-faint">
                    Nothing in the local knowledge base matched that closely enough to cite.
                  </li>
                )}
                {results.map((item) => (
                  <motion.li
                    key={item.id}
                    initial={{ opacity: 0, y: 3 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-panel border border-seam bg-raised p-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="instrument text-[0.75rem] font-semibold text-brass">
                        {item.id}
                      </span>
                      <span className="text-[0.875rem] text-ink">{item.source_document}</span>
                      <Chip signal={classificationSignal(item.classification)}>
                        {item.classification}
                      </Chip>
                      {item.score != null && (
                        <span className="instrument text-[0.6875rem] text-ink-faint">
                          {(item.score * 100).toFixed(0)}% match
                        </span>
                      )}
                    </div>
                    {item.location && (
                      <div className="mt-0.5 text-[0.6875rem] text-ink-faint">{item.location}</div>
                    )}
                    <blockquote className="vellum mt-2 px-3.5 py-2.5 text-[0.8125rem] leading-relaxed">
                      {item.excerpt}
                    </blockquote>
                  </motion.li>
                ))}
              </ul>
            )}
          </Panel>

          {error && (
            <p className="rounded-chip border border-alarm/40 bg-alarm/10 px-3 py-2 text-[0.8125rem] text-alarm">
              {error}
            </p>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            {/* --------------------------------------- knowledge base */}
            <Panel
              title={`Reference documents · ${documents.length}`}
              action={
                canIngest && (
                  <div className="flex items-center gap-1.5">
                    <select
                      value={department}
                      onChange={(event) => setDepartment(event.target.value)}
                      aria-label="Department"
                      className="rounded-chip border border-seam bg-raised px-1.5 py-1 text-[0.6875rem] text-ink-dim outline-none focus:border-brass/60"
                    >
                      {DEPARTMENTS.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                    <select
                      value={classification}
                      onChange={(event) => setClassification(event.target.value)}
                      aria-label="Classification"
                      className="rounded-chip border border-seam bg-raised px-1.5 py-1 text-[0.6875rem] text-ink-dim outline-none focus:border-brass/60"
                    >
                      {LEVELS.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                    <input
                      ref={ingestRef}
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(event) => void ingest(event.target.files)}
                    />
                    <Button variant="secondary" onClick={() => ingestRef.current?.click()}>
                      Add document
                    </Button>
                  </div>
                )
              }
            >
              {documents.length === 0 ? (
                <EmptyState heading="No reference documents yet">
                  Add a procedure or manual and the workbench will cite it by section
                  whenever it is relevant.
                </EmptyState>
              ) : (
                <ul className="space-y-2">
                  {documents.map((document) => (
                    <li
                      key={document.id}
                      className="rounded-chip border border-seam bg-raised px-3 py-2.5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-[0.875rem] font-medium text-ink">
                            {document.title}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.6875rem] text-ink-faint">
                            <Chip signal={classificationSignal(document.classification)}>
                              {document.classification}
                            </Chip>
                            <span>{document.department}</span>
                            <span>rev {document.version}</span>
                            <span className="instrument">
                              {document.chunk_count} passages
                            </span>
                            <span>{formatBytes(document.size_bytes)}</span>
                          </div>
                        </div>
                        {canManage && (
                          <Button
                            variant="quiet"
                            onClick={async () => {
                              await api.deleteDocument(document.id);
                              await load();
                            }}
                          >
                            Remove
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            {/* ------------------------------------------ attachments */}
            <Panel title={`Files you uploaded · ${files.length}`}>
              {files.length === 0 ? (
                <EmptyState heading="Nothing uploaded yet">
                  Files you attach to a request in the workspace appear here, with the
                  fingerprint used to prove they were not altered.
                </EmptyState>
              ) : (
                <ul className="space-y-2">
                  {files.map((file) => (
                    <li
                      key={file.id}
                      className="rounded-chip border border-seam bg-raised px-3 py-2.5"
                    >
                      <div className="truncate text-[0.875rem] text-ink">{file.filename}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.6875rem] text-ink-faint">
                        <Chip signal={classificationSignal(file.classification)}>
                          {file.classification}
                        </Chip>
                        <span>{file.input_type.replace(/_/g, " ")}</span>
                        <span>{formatBytes(file.size_bytes)}</span>
                        <span>{formatDateTime(file.uploaded_at)}</span>
                      </div>
                      <div className="instrument mt-1 truncate text-[0.625rem] text-ink-faint">
                        sha256 {file.sha256}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </div>
      </div>
    </Shell>
  );
}
