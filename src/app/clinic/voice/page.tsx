import { resolveSession } from '@core/auth/session'
import { redirect } from 'next/navigation'
import { listUnassociated } from '@modules/voice/voice.service'
import { VoiceUploadForm } from './upload-form'
import { AssociateNoteForm } from './associate-form'

import { roleHasPermission } from '@core/auth/permissions'

export default async function VoiceQueuePage() {
  const session = await resolveSession()
  if (session.status !== 'ACTIVE') redirect('/sign-in')

  if (!roleHasPermission(session.actor.role, 'query.associate')) {
    return (
      <main className="mx-auto max-w-lg px-6 py-10">
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h1 className="text-lg font-semibold text-slate-900">Not available to you</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Your role ({session.actor.role.toLowerCase()}) does not have permission to review or associate voice queries.
          </p>
        </div>
      </main>
    )
  }

  const unassociatedNotes = await listUnassociated(session.actor, 50)

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-8">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Voice Intake Queue</h1>
          <p className="mt-2 text-sm text-slate-600">
            Upload WhatsApp voice notes or view the unassociated queue. Transcribed notes can be assigned to a patient's UUID to surface in their Cockpit.
          </p>
        </div>

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-medium text-slate-900">Upload New Voice Note</h2>
          <VoiceUploadForm />
        </section>

        <section>
          <h2 className="mb-4 text-lg font-medium text-slate-900">Unassociated Queue ({unassociatedNotes.length})</h2>
          
          {unassociatedNotes.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
              <p className="text-slate-500">The queue is empty.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {unassociatedNotes.map((note) => (
                <div key={note.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          note.triageTag === 'RED_FLAG' ? 'bg-red-100 text-red-800' :
                          note.triageTag === 'POTENTIAL_RISK' ? 'bg-amber-100 text-amber-800' :
                          'bg-green-100 text-green-800'
                        }`}>
                          {note.triageTag}
                        </span>
                        <span className="text-sm text-slate-500">
                          {new Date(note.createdAt).toLocaleString()}
                        </span>
                        {note.fromPhone && (
                          <span className="text-sm text-slate-500">• Phone: {note.fromPhone}</span>
                        )}
                      </div>
                      
                      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="rounded-lg bg-slate-50 p-4">
                          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Original Audio</p>
                          <audio src={`/api/media/${note.audioObjectKey}`} controls className="w-full" />
                          <p className="mt-3 text-sm text-slate-700 italic">"{note.transcriptOriginal || 'Transcription pending...'}"</p>
                        </div>
                        <div className="rounded-lg bg-slate-50 p-4">
                          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">English Translation</p>
                          <p className="text-sm text-slate-900 font-medium">"{note.transcriptEnglish || 'Translation pending...'}"</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-6 border-t border-slate-100 pt-4">
                    <AssociateNoteForm queryId={note.id} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
