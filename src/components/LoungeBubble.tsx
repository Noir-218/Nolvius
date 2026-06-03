import React, { useState, useEffect } from 'react';
import { Plus, Trash2, StickyNote, Sparkles, Clock, X, Coffee } from 'lucide-react';

interface Note {
  id: string;
  text: string;
  color: string;
}

const COLORS = [
  '#fef3c7', // Yellow
  '#fee2e2', // Red/Pink
  '#dcfce7', // Green
  '#e0f2fe', // Blue
  '#f3e8ff', // Purple
];

interface LoungeBubbleProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LoungeBubble: React.FC<LoungeBubbleProps> = ({ isOpen, onClose }) => {
  const [notes, setNotes] = useState<Note[]>(() => {
    const saved = localStorage.getItem('lounge-notes');
    return saved ? JSON.parse(saved) : [
      { id: '1', text: 'Chào mừng bạn đến với Góc Thư Giãn! ☕', color: '#fef3c7' },
      { id: '2', text: 'Đừng quên kiểm tra hạn sử dụng của sữa nhé.', color: '#fee2e2' },
      { id: '3', text: 'Chúc bạn một ca làm việc vui vẻ! ✨', color: '#dcfce7' },
    ];
  });
  const [time, setTime] = useState(new Date());
  const [newNoteText, setNewNoteText] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    localStorage.setItem('lounge-notes', JSON.stringify(notes));
  }, [notes]);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const addNote = () => {
    if (!newNoteText.trim()) return;
    const newNote: Note = {
      id: Date.now().toString(),
      text: newNoteText.trim(),
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    };
    setNotes([newNote, ...notes]);
    setNewNoteText('');
    setIsAdding(false);
  };

  const updateNote = (id: string, text: string) => {
    setNotes(notes.map(n => n.id === id ? { ...n, text } : n));
  };

  const deleteNote = (id: string) => {
    setNotes(notes.filter(n => n.id !== id));
  };

  if (!isOpen) return null;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Handlee&display=swap');
        .lounge-note-textarea {
          font-family: 'Handlee', cursive !important;
        }
        .lounge-bubble-panel {
          animation: lounge-pop-in 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275) both;
          transform-origin: top right;
        }
        @keyframes lounge-pop-in {
          from { opacity: 0; transform: scale(0.85) translateY(-10px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>

      {/* Panel */}
      <div className="lounge-bubble-panel fixed top-16 right-4 z-40 w-[400px] max-w-[calc(100vw-2rem)] bg-[#fdf8f4] rounded-3xl shadow-2xl border border-amber-100/80 flex flex-col overflow-hidden"
        style={{ maxHeight: 'calc(100vh - 5rem)' }}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-600 to-orange-500 p-4 flex items-center justify-between shadow-md shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 p-2 rounded-2xl border border-white/10">
              <Coffee size={20} className="text-white" />
            </div>
            <div>
              <h6 className="font-extrabold text-sm tracking-wide uppercase mb-0 text-white flex items-center gap-1.5">
                Góc Chill Staff
              </h6>
              <span className="text-[10px] text-amber-100 font-bold uppercase tracking-widest flex items-center gap-1.5">
                <Clock size={10} />
                {time.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                <span className="ml-1">·</span>
                <Sparkles size={10} className="animate-pulse" />
                Robert is cheering you on! 🐸
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/15 rounded-xl text-amber-100 hover:text-white transition-all"
            title="Đóng"
          >
            <X size={18} />
          </button>
        </div>

        {/* Add note input */}
        <div className="px-4 pt-4 pb-2 shrink-0">
          {isAdding ? (
            <div className="bg-white rounded-2xl border border-amber-100 shadow-sm p-3 flex flex-col gap-2">
              <textarea
                autoFocus
                value={newNoteText}
                onChange={(e) => setNewNoteText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) addNote();
                  if (e.key === 'Escape') { setIsAdding(false); setNewNoteText(''); }
                }}
                placeholder="Viết ghi chú... (Ctrl+Enter để lưu)"
                rows={3}
                className="lounge-note-textarea w-full bg-transparent border-none resize-none focus:ring-0 text-amber-900 text-sm leading-relaxed placeholder:text-amber-900/30 outline-none"
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => { setIsAdding(false); setNewNoteText(''); }}
                  className="text-[10px] font-black uppercase tracking-wider text-gray-400 hover:text-gray-600 px-3 py-1.5 rounded-xl border border-gray-100 bg-white transition-all"
                >
                  Hủy
                </button>
                <button
                  onClick={addNote}
                  className="text-[10px] font-black uppercase tracking-wider text-white bg-amber-500 hover:bg-amber-600 px-3 py-1.5 rounded-xl transition-all"
                >
                  Lưu ghi chú
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setIsAdding(true)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border-2 border-dashed border-amber-200/70 hover:border-amber-400 hover:bg-amber-50/60 text-amber-700/50 hover:text-amber-800 transition-all duration-200 group"
            >
              <Plus size={18} className="group-hover:scale-110 transition-transform" />
              <span className="text-xs font-black uppercase tracking-widest">Thêm Ghi Chú Mới</span>
            </button>
          )}
        </div>

        {/* Notes List */}
        <div className="flex-1 overflow-y-auto px-4 pb-4 flex flex-col gap-3">
          {notes.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 text-amber-900/30">
              <StickyNote size={36} className="mb-3 opacity-40" />
              <p className="text-xs font-black uppercase tracking-widest">Chưa có ghi chú nào</p>
            </div>
          )}
          {notes.map((note) => (
            <div
              key={note.id}
              className="relative rounded-2xl shadow-sm group transition-all hover:shadow-md"
              style={{ backgroundColor: note.color }}
            >
              {/* Pin decoration */}
              <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 w-5 h-5 bg-red-400/80 rounded-full shadow border-2 border-white/30 ring-4 ring-red-400/10 z-10" />

              <div className="p-4 pt-5">
                <div className="flex justify-end mb-1">
                  <button
                    onClick={() => deleteNote(note.id)}
                    className="p-1.5 text-black/20 hover:text-red-500 hover:bg-red-50 rounded-full transition-all opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <textarea
                  value={note.text}
                  onChange={(e) => updateNote(note.id, e.target.value)}
                  placeholder="Viết gì đó..."
                  rows={3}
                  className="lounge-note-textarea w-full bg-transparent border-none resize-none focus:ring-0 text-amber-900 font-medium leading-relaxed placeholder:text-amber-900/30 text-base italic outline-none"
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

export default LoungeBubble;
