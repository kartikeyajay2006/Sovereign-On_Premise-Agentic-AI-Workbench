'use client'

import { useEffect, useMemo, useState } from 'react'
import { Plus, RotateCw } from 'lucide-react'
import { PageHeader, type PageHeaderStat } from '@/components/page-header'
import { useRole } from '@/components/role-context'
import { useToast } from '@/components/toast'
import { Button } from '@/shared/ui/controls/button'
import { Tabs, tabPanelProps } from '@/shared/ui/controls/tabs'
import { FailureState, ReadingLine, clockTime, useReading } from '@/shared/ui/data/reading'
import { readDocuments, readModels, readUploads } from './api'
import { IngestDialog } from './ingest-dialog'
import { ModelEstate } from './model-estate'
import { RetrievalTester } from './retrieval-tester'
import { DocumentsTable, UploadsTable } from './tables'

type Tab = 'documents' | 'retrieval' | 'models' | 'uploads'
const TABS: Tab[] = ['documents', 'retrieval', 'models', 'uploads']
const ID = 'knowledge'

/**
 * Knowledge: what retrieval can cite, the models that run here, and a tester
 * for retrieval itself.
 *
 * Every figure on this screen is read from the host when the screen asks for
 * it. The tab is kept in the URL fragment so a reload, or a link sent to
 * someone, opens the same section. The models tab reads its two endpoints
 * only when it is first opened, because both make the service ask the model
 * runtime, which is the busiest process on the machine during a run.
 */
export function RegistryView() {
  const { can, user, role } = useRole()
  const { push } = useToast()
  const [tab, setTab] = useState<Tab>('documents')
  const [modelsWanted, setModelsWanted] = useState(false)
  const [ingestOpen, setIngestOpen] = useState(false)

  const documents = useReading((signal) => readDocuments(signal), [])
  const uploads = useReading((signal) => readUploads(signal), [])
  const models = useReading((signal) => readModels(signal), [], { enabled: modelsWanted })

  useEffect(() => {
    const fromHash = window.location.hash.replace('#', '') as Tab
    if (TABS.includes(fromHash)) setTab(fromHash)
  }, [])

  useEffect(() => {
    if (tab === 'models') setModelsWanted(true)
  }, [tab])

  const selectTab = (next: Tab) => {
    setTab(next)
    window.history.replaceState(null, '', `#${next}`)
  }

  const canIngest = can('knowledge.ingest')
  const canSearch = can('knowledge.search')

  const docs = documents.data
  const chunks = docs ? docs.reduce((sum, d) => sum + d.chunk_count, 0) : null
  const departments = useMemo(
    () => [...new Set([...(docs ?? []).map((d) => d.department), user?.department].filter((d): d is string => Boolean(d)))].sort(),
    [docs, user?.department],
  )

  const stats: PageHeaderStat[] = [
    { label: 'Documents', value: docs ? String(docs.length) : '—', hint: 'GET /api/knowledge/documents' },
    { label: 'Chunks', value: chunks === null ? '—' : String(chunks), hint: 'Sum of each document’s indexed chunks' },
    { label: 'Uploads', value: uploads.data ? String(uploads.data.length) : '—', hint: 'Files this role can read' },
  ]
  if (models.data) {
    const [status] = models.data
    stats.push({
      label: 'Models',
      value: `${status.available} of ${status.registered}`,
      tone: status.available === 0 ? 'critical' : 'default',
      hint: 'Installed of registered, GET /api/models/status',
    })
  }

  const ingestButton = canIngest ? (
    <Button variant="secondary" size="sm" ground="paper" icon={Plus} onClick={() => setIngestOpen(true)}>
      Ingest document
    </Button>
  ) : null

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Knowledge"
        description="The documents retrieval can cite, the models that run on this host, and a tester for retrieval itself."
        meta={stats}
        actions={
          <>
            {documents.readAt !== null && (
              <span className="font-mono text-ledger text-foreground-muted">read {clockTime(documents.readAt)}</span>
            )}
            <Button
              variant="ghost"
              size="sm"
              ground="paper"
              icon={RotateCw}
              busy={documents.refreshing || uploads.refreshing || models.refreshing}
              busyLabel="Reading…"
              onClick={() => {
                documents.reload()
                uploads.reload()
                if (modelsWanted) models.reload()
              }}
            >
              Refresh
            </Button>
            {ingestButton}
          </>
        }
      />

      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-4 pb-16 pt-4 sm:px-6">
        <Tabs<Tab>
          label="Knowledge sections"
          idBase={ID}
          value={tab}
          onChange={selectTab}
          items={[
            { value: 'documents', label: 'Documents', count: docs?.length ?? null },
            { value: 'retrieval', label: 'Retrieval test' },
            { value: 'models', label: 'Models', count: models.data ? models.data[1].length : null },
            { value: 'uploads', label: 'Uploads', count: uploads.data?.length ?? null },
          ]}
        />

        <div {...tabPanelProps(ID, tab)} className="outline-none">
          {tab === 'documents' &&
            (documents.status === 'failed' && !docs ? (
              <FailureState failure={documents.failure!} what="the document index" retry={documents.reload} />
            ) : !docs ? (
              <ReadingLine what="the document index" source="GET /api/knowledge/documents" startedAt={documents.startedAt} />
            ) : (
              <DocumentsTable documents={docs} emptyAction={ingestButton} />
            ))}

          {tab === 'retrieval' && (
            <RetrievalTester canSearch={canSearch} searchedAs={`${user?.display_name ?? role.label} (${role.label})`} />
          )}

          {tab === 'models' &&
            (models.status === 'failed' && !models.data ? (
              <FailureState failure={models.failure!} what="the model registry" retry={models.reload} />
            ) : !models.data ? (
              <ReadingLine what="the model registry" source="GET /api/models/status" startedAt={models.startedAt} />
            ) : (
              <ModelEstate status={models.data[0]} models={models.data[1]} />
            ))}

          {tab === 'uploads' &&
            (uploads.status === 'failed' && !uploads.data ? (
              <FailureState failure={uploads.failure!} what="the uploaded files" retry={uploads.reload} />
            ) : !uploads.data ? (
              <ReadingLine what="the uploaded files" source="GET /api/files" startedAt={uploads.startedAt} />
            ) : (
              <UploadsTable files={uploads.data} />
            ))}
        </div>
      </div>

      <IngestDialog
        open={ingestOpen}
        onClose={() => setIngestOpen(false)}
        defaultDepartment={user?.department ?? 'general'}
        departments={departments}
        onIngested={(document) => {
          setIngestOpen(false)
          push({
            title: 'Document indexed',
            detail: `${document.title}: ${document.chunk_count} chunk${document.chunk_count === 1 ? '' : 's'} at ${document.classification}. Recorded in the audit chain.`,
            tone: 'sovereign',
          })
          documents.reload()
          selectTab('documents')
        }}
      />
    </div>
  )
}
