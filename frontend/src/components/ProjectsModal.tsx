import React, { useState, useEffect } from 'react';
import { X, FolderKanban, Plus, FileText, Trash2, CheckCircle, Loader2 } from 'lucide-react';
import { api } from '../services/api';
import { Project } from '../types';

interface ProjectsModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeProjectId?: string | null;
  onSelectProject: (project: Project | null) => void;
}

export const ProjectsModal: React.FC<ProjectsModalProps> = ({
  isOpen,
  onClose,
  activeProjectId,
  onSelectProject,
}) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [showCreateForm, setShowCreateForm] = useState<boolean>(false);
  const [name, setName] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [instructions, setInstructions] = useState<string>('');

  const loadProjects = async () => {
    setIsLoading(true);
    try {
      const data = await api.getProjects();
      setProjects(data);
    } catch (err) {
      console.error('Failed to load projects:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) loadProjects();
  }, [isOpen]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      const created = await api.createProject(name, description, instructions);
      setProjects((prev) => [created, ...prev]);
      onSelectProject(created);
      setShowCreateForm(false);
      setName('');
      setDescription('');
      setInstructions('');
    } catch (err) {
      console.error('Failed to create project:', err);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.deleteProject(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
      if (activeProjectId === id) onSelectProject(null);
    } catch (err) {
      console.error('Failed to delete project:', err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 select-none font-['Plus_Jakarta_Sans',sans-serif]">
      <div className="w-full max-w-xl bg-[#090e1c] border border-[#1e2a44] rounded-3xl p-6 shadow-2xl space-y-5 text-slate-200 font-mono text-xs">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#16233b] pb-3">
          <div className="flex items-center gap-2">
            <FolderKanban className="w-5 h-5 text-cyan-400" />
            <h3 className="font-extrabold text-base text-white">AI Projects Workspace</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-[#16233b] text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-slate-400 text-xs leading-relaxed font-sans">
          Organize chats, uploaded files, and custom behavioral instructions inside dedicated project workspaces (e.g. <strong>NEPSE Swing Trading Project</strong>).
        </p>

        {/* Create Form Toggle */}
        {!showCreateForm ? (
          <button
            onClick={() => setShowCreateForm(true)}
            className="w-full py-2.5 rounded-2xl bg-cyan-400 hover:bg-cyan-300 text-black font-extrabold text-xs flex items-center justify-center gap-2 transition-all shadow-lg"
          >
            <Plus className="w-4 h-4" />
            <span>Create New Project</span>
          </button>
        ) : (
          <form onSubmit={handleCreate} className="p-4 rounded-2xl bg-[#0d1424] border border-[#1e2a44] space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-cyan-300 text-xs">New Project Workspace</span>
              <button onClick={() => setShowCreateForm(false)} className="text-slate-500 hover:text-white text-xs">
                Cancel
              </button>
            </div>
            <input
              type="text"
              placeholder="Project Name (e.g. Banking Sector Swing Strategy)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-[#050812] border border-[#1e2a44] rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
            />
            <input
              type="text"
              placeholder="Description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-[#050812] border border-[#1e2a44] rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
            />
            <textarea
              rows={3}
              placeholder="Custom Project Instructions (e.g. Always evaluate setups with strict 1:2.5 minimum R/R and cite Nepali support levels)"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              className="w-full bg-[#050812] border border-[#1e2a44] rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 resize-none font-sans"
            />
            <button
              type="submit"
              disabled={!name.trim()}
              className="w-full py-2 bg-gradient-to-r from-cyan-400 to-emerald-500 hover:from-cyan-300 hover:to-emerald-400 disabled:opacity-40 text-black font-extrabold rounded-xl transition-all"
            >
              Save Project
            </button>
          </form>
        )}

        {/* Project List */}
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-6 gap-2 text-cyan-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Loading projects...</span>
            </div>
          ) : projects.length === 0 ? (
            <div className="text-center py-6 text-slate-500">No project workspaces created yet.</div>
          ) : (
            projects.map((p) => (
              <div
                key={p.id}
                onClick={() => {
                  onSelectProject(activeProjectId === p.id ? null : p);
                  onClose();
                }}
                className={`flex items-center justify-between p-3.5 rounded-2xl cursor-pointer transition-all border ${
                  activeProjectId === p.id
                    ? 'bg-cyan-950/70 border-cyan-400 text-cyan-200 shadow-[0_0_15px_rgba(34,211,238,0.2)]'
                    : 'bg-[#0b1120] border-[#1a263f] hover:border-cyan-500/40 text-slate-300'
                }`}
              >
                <div className="space-y-1 flex-1 pr-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white text-xs">{p.name}</span>
                    {activeProjectId === p.id && (
                      <span className="text-[9px] bg-emerald-950 text-emerald-400 border border-emerald-700 px-1.5 py-0.2 rounded-full font-bold">
                        ACTIVE
                      </span>
                    )}
                  </div>
                  {p.description && <div className="text-[11px] text-slate-400 font-sans line-clamp-1">{p.description}</div>}
                  {p.instructions && (
                    <div className="text-[10px] text-cyan-400/80 font-mono line-clamp-1">
                      📝 {p.instructions}
                    </div>
                  )}
                </div>
                <button
                  onClick={(e) => handleDelete(p.id, e)}
                  className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-rose-950/30 transition-colors"
                  title="Delete project"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[#16233b] pt-3">
          {activeProjectId && (
            <button
              onClick={() => {
                onSelectProject(null);
                onClose();
              }}
              className="text-slate-400 hover:text-white text-xs"
            >
              Clear Active Project Context
            </button>
          )}
          <button
            onClick={onClose}
            className="ml-auto px-4 py-1.5 bg-[#16233b] hover:bg-[#203152] text-slate-200 font-bold rounded-xl"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
