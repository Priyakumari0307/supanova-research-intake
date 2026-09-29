'use client';

import React, { useState } from 'react';
import { Header } from '@/components/Header';
import { RoutingPreview } from '@/components/RoutingPreview';
import { RecentSignals } from '@/components/RecentSignals';
import { evaluateRouting, createSignal } from '@/lib/api';
import { RoutingResult } from '@/types/api.types';
import {
  Link2,
  FileText,
  ArrowRight,
  Loader2,
  AlertCircle,
  CheckCircle2,
  X,
} from 'lucide-react';

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<'url' | 'note'>('url');
  const [urlInput, setUrlInput] = useState('');
  const [textInput, setTextInput] = useState('');
  const [titleInput, setTitleInput] = useState('');

  // Routing preview states
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [previewResult, setPreviewResult] = useState<RoutingResult | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Signal creation states
  const [isCreating, setIsCreating] = useState(false);
  const [creationError, setCreationError] = useState<string | null>(null);
  const [creationSuccess, setCreationSuccess] = useState<{
    id: string;
    project: string;
    title: string;
  } | null>(null);

  // Trigger for refreshing the Recent Signals list
  const [refreshKey, setRefreshKey] = useState(0);

  const handlePreview = async () => {
    setPreviewError(null);
    setCreationError(null);
    setCreationSuccess(null);

    const targetUrl = activeTab === 'url' ? urlInput.trim() : '';
    const targetText = activeTab === 'note' ? textInput.trim() : '';
    const targetTitle = titleInput.trim();

    if (activeTab === 'url' && !targetUrl) {
      setPreviewError('Please enter a source URL to preview routing.');
      return;
    }

    if (activeTab === 'note' && !targetText) {
      setPreviewError('Please enter a note or text excerpt to preview routing.');
      return;
    }

    setIsEvaluating(true);
    try {
      const result = await evaluateRouting({
        url: targetUrl || undefined,
        text: targetText || undefined,
        title: targetTitle || undefined,
      });
      setPreviewResult(result);
    } catch (err: any) {
      setPreviewError(err.message || 'Failed to calculate routing preview.');
    } finally {
      setIsEvaluating(false);
    }
  };

  const handleClearPreview = () => {
    setPreviewResult(null);
    setPreviewError(null);
    setCreationError(null);
  };

  const handleCreateSignal = async () => {
    if (!previewResult) return;

    setCreationError(null);
    setIsCreating(true);

    const targetUrl = activeTab === 'url' ? urlInput.trim() : '';
    const targetText = activeTab === 'note' ? textInput.trim() : '';
    const targetTitle = titleInput.trim();

    try {
      const result = await createSignal({
        url: targetUrl || undefined,
        text: targetText || undefined,
        title: targetTitle || undefined,
      });

      if (result.status === 'created' && result.signal) {
        setCreationSuccess({
          id: result.signal.id,
          project: result.signal.projects[0] || 'internal_unsorted',
          title: result.signal.title,
        });

        // Reset form inputs & clear preview state
        setUrlInput('');
        setTextInput('');
        setTitleInput('');
        setPreviewResult(null);
        setPreviewError(null);

        // Increment refreshKey to trigger RecentSignals reload
        setRefreshKey((k) => k + 1);
      } else {
        setCreationError(result.error || 'Failed to commit signal to ledger.');
      }
    } catch (err: any) {
      setCreationError(err.message || 'Failed to commit signal to backend.');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-[#090d14] min-h-screen">
      <Header />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-8 flex flex-col gap-8">
        {/* Main Title Section */}
        <section className="flex flex-col gap-1.5 pt-2">
          <span className="text-[11px] font-mono uppercase tracking-wider text-indigo-400 font-semibold">
            Research intake
          </span>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            Bring a useful signal into the inbox.
          </h1>
          <p className="text-sm text-slate-400 leading-relaxed max-w-2xl">
            Paste a link or a note. We&apos;ll route it to the right project before anything is written.
          </p>
        </section>

        {/* Prominent Intake Panel */}
        <section className="rounded-lg border border-slate-800 bg-[#0f1724] p-5 sm:p-6 flex flex-col gap-5 shadow-sm">
          {/* Tabs */}
          <div className="flex items-center gap-1 border-b border-slate-800/80 pb-3">
            <button
              type="button"
              onClick={() => {
                setActiveTab('url');
                setPreviewError(null);
              }}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                activeTab === 'url'
                  ? 'bg-slate-800 text-white font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Link2 className="w-3.5 h-3.5" />
              <span>URL</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('note');
                setPreviewError(null);
              }}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                activeTab === 'note'
                  ? 'bg-slate-800 text-white font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Note</span>
            </button>
          </div>

          {/* Tab Content Area */}
          <div className="flex flex-col gap-4">
            {activeTab === 'url' ? (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="url-input" className="text-xs font-medium text-slate-300">
                    Source link <span className="text-red-400">*</span>
                  </label>
                  <input
                    id="url-input"
                    type="url"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="https://northwind.example/orders/294 or https://atlaspermits.example/permits/49"
                    className="w-full bg-[#090d14] border border-slate-800 rounded-md px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 font-mono"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="url-title" className="text-xs font-medium text-slate-400">
                    Title <span className="text-slate-500 font-normal">(optional, auto-extracted if empty)</span>
                  </label>
                  <input
                    id="url-title"
                    type="text"
                    value={titleInput}
                    onChange={(e) => setTitleInput(e.target.value)}
                    placeholder="e.g. Northwind invoice sync kickoff"
                    className="w-full bg-[#090d14] border border-slate-800 rounded-md px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="note-input" className="text-xs font-medium text-slate-300">
                    Note or excerpt <span className="text-red-400">*</span>
                  </label>
                  <textarea
                    id="note-input"
                    rows={4}
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    placeholder="Paste raw research notes, meeting transcript excerpt, or project discussion..."
                    className="w-full bg-[#090d14] border border-slate-800 rounded-md px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 font-sans resize-y"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="note-title" className="text-xs font-medium text-slate-400">
                    Title <span className="text-slate-500 font-normal">(optional, derived from first line if empty)</span>
                  </label>
                  <input
                    id="note-title"
                    type="text"
                    value={titleInput}
                    onChange={(e) => setTitleInput(e.target.value)}
                    placeholder="e.g. Harborline manifest import notes"
                    className="w-full bg-[#090d14] border border-slate-800 rounded-md px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>
            )}

            {/* Validation / Request Error Message */}
            {previewError && (
              <div className="flex items-center gap-2 px-3 py-2 rounded bg-rose-950/30 border border-rose-800/50 text-xs text-rose-300">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{previewError}</span>
              </div>
            )}

            {/* Action Row */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-800/80">
              <span className="text-xs text-slate-500">
                Nothing is committed until you review the routing preview.
              </span>
              <button
                type="button"
                onClick={handlePreview}
                disabled={isEvaluating || isCreating}
                className="inline-flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white font-medium text-xs px-4 py-2 rounded-md transition-colors shadow-sm self-start sm:self-auto cursor-pointer"
              >
                {isEvaluating ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Evaluating preview...</span>
                  </>
                ) : (
                  <>
                    <span>Preview signal</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>
          </div>
        </section>

        {/* Signal Creation Success Banner */}
        {creationSuccess && (
          <div className="rounded-lg border border-emerald-500/40 bg-emerald-950/20 p-4 flex items-start justify-between gap-3 text-xs text-emerald-300 animate-in fade-in duration-200">
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
              <div className="flex flex-col gap-1">
                <span className="font-semibold text-emerald-200">
                  Signal successfully added to inbox &amp; committed to ledger!
                </span>
                <div className="flex items-center gap-2 flex-wrap text-[11px] text-emerald-300/90 font-mono">
                  <span>ID: {creationSuccess.id}</span>
                  <span>&bull;</span>
                  <span>Project: {creationSuccess.project}</span>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setCreationSuccess(null)}
              className="text-emerald-400/80 hover:text-emerald-200 p-0.5 rounded cursor-pointer"
              title="Dismiss notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Routing Preview / Review Component (rendered when previewResult is present) */}
        {previewResult && (
          <RoutingPreview
            result={previewResult}
            inputType={activeTab}
            inputPayload={{
              url: activeTab === 'url' ? urlInput.trim() : undefined,
              text: activeTab === 'note' ? textInput.trim() : undefined,
              title: titleInput.trim() || undefined,
            }}
            onClear={handleClearPreview}
            onCreate={handleCreateSignal}
            isCreating={isCreating}
            creationError={creationError}
          />
        )}

        {/* Compact How Routing Works Section */}
        <section className="rounded-lg border border-slate-800 bg-[#0f1724]/70 p-4 sm:p-5 flex flex-col gap-3">
          <h2 className="text-xs font-mono uppercase tracking-wider text-slate-400 font-semibold">
            How routing works
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-slate-300">
            <div className="bg-[#090d14] border border-slate-800/80 rounded p-3 flex flex-col gap-1">
              <span className="font-semibold text-slate-200">1. Routing hints</span>
              <span className="text-slate-400 leading-relaxed">
                Matches explicit rules configured in <code className="font-mono text-slate-300">routing-hints.json</code> first.
              </span>
            </div>
            <div className="bg-[#090d14] border border-slate-800/80 rounded p-3 flex flex-col gap-1">
              <span className="font-semibold text-slate-200">2. Project match</span>
              <span className="text-slate-400 leading-relaxed">
                Checks configured client domains and whole-word keywords.
              </span>
            </div>
            <div className="bg-[#090d14] border border-slate-800/80 rounded p-3 flex flex-col gap-1">
              <span className="font-semibold text-slate-200">3. Fallback</span>
              <span className="text-slate-400 leading-relaxed">
                Unmatched or ambiguous signals route to <code className="font-mono text-slate-300">internal_unsorted</code>.
              </span>
            </div>
          </div>
        </section>

        {/* Live Recent Signals Stream from Backend */}
        <RecentSignals refreshKey={refreshKey} />
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/60 py-5 text-center text-xs text-slate-500 font-mono mt-8">
        Supanova Inbox &bull; Local ledger &bull; Offline
      </footer>
    </div>
  );
}
