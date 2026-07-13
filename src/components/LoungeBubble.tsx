import React, { useState, useEffect } from 'react';
import { Plus, Trash2, StickyNote, Sparkles, Clock, X, Coffee, Square, CheckSquare, ListTodo } from 'lucide-react';

interface TodoItem {
  id: string;
  text: string;
  checked: boolean;
}

interface Note {
  id: string;
  text: string;
  color: string;
  todos?: TodoItem[];
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
      { id: '1', text: 'Chào mừng bạn đến với Góc Thư Giãn! ☕', color: '#fef3c7', todos: [] },
      { id: '2', text: 'Đừng quên kiểm tra hạn sử dụng của sữa nhé.', color: '#fee2e2', todos: [] },
      { id: '3', text: 'Chúc bạn một ca làm việc vui vẻ! ✨', color: '#dcfce7', todos: [] },
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
      todos: [],
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

  const addTodo = (noteId: string) => {
    setNotes(notes.map(n => {
      if (n.id !== noteId) return n;
      const newTodo: TodoItem = {
        id: Date.now().toString() + Math.random().toString(36).substring(2, 7),
        text: '',
        checked: false
      };
      return {
        ...n,
        todos: [...(n.todos || []), newTodo]
      };
    }));
  };

  const updateTodoText = (noteId: string, todoId: string, text: string) => {
    setNotes(notes.map(n => {
      if (n.id !== noteId) return n;
      return {
        ...n,
        todos: (n.todos || []).map(t => t.id === todoId ? { ...t, text } : t)
      };
    }));
  };

  const toggleTodo = (noteId: string, todoId: string) => {
    setNotes(notes.map(n => {
      if (n.id !== noteId) return n;
      return {
        ...n,
        todos: (n.todos || []).map(t => t.id === todoId ? { ...t, checked: !t.checked } : t)
      };
    }));
  };

  const deleteTodo = (noteId: string, todoId: string) => {
    setNotes(notes.map(n => {
      if (n.id !== noteId) return n;
      return {
        ...n,
        todos: (n.todos || []).filter(t => t.id !== todoId)
      };
    }));
  };

  if (!isOpen) return null;

  return (
    <>
      <style>{`
        .lounge-bubble-panel {
          animation: lounge-pop-in 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275) both;
          transform-origin: top right;
        }
        @keyframes lounge-pop-in {
          from { opacity: 0; transform: scale(0.85) translateY(-10px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes stamp-pop {
          0% { transform: scale(3) rotate(-35deg); opacity: 0; }
          100% { transform: scale(1) rotate(-12deg); opacity: 0.85; }
        }
        .stamp-effect {
          animation: stamp-pop 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.3) forwards;
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
                className="w-full bg-transparent border-none resize-none focus:ring-0 text-amber-900 text-sm leading-relaxed placeholder:text-amber-900/30 outline-none"
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
          {notes.map((note) => {
            const hasTodos = note.todos && note.todos.length > 0;
            const allDone = hasTodos && note.todos!.every(t => t.checked);

            return (
              <div
                key={note.id}
                className="relative rounded-2xl shadow-sm group/card transition-all hover:shadow-md overflow-hidden"
                style={{ backgroundColor: note.color }}
              >
                {/* Pin decoration */}
                <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 w-5 h-5 bg-red-400/80 rounded-full shadow border-2 border-white/30 ring-4 ring-red-400/10 z-10" />

                {/* Delete Button - always visible on hover/card, styled nicely */}
                <button
                  onClick={() => {
                    if (confirm('Bạn có chắc muốn xóa ghi chú này?')) {
                      deleteNote(note.id);
                    }
                  }}
                  className="absolute top-2 right-2 p-1.5 text-black/30 hover:text-red-600 hover:bg-red-50/80 rounded-full transition-all opacity-0 group-hover/card:opacity-100 z-30"
                  title="Xóa ghi chú"
                >
                  <Trash2 size={14} />
                </button>

                {/* Stamp Done */}
                {allDone && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20 select-none bg-white/20 backdrop-blur-[0.5px]">
                    <div className="stamp-effect border-4 border-double border-red-600 text-red-600 font-extrabold text-3xl px-5 py-2 rounded-lg uppercase tracking-widest bg-white/90 shadow-md">
                      DONE
                    </div>
                  </div>
                )}

                <div className="p-4 pt-6 flex flex-col" style={{ maxHeight: '320px' }}>
                  {/* Note text content */}
                  <textarea
                    value={note.text}
                    onChange={(e) => updateNote(note.id, e.target.value)}
                    placeholder="Viết gì đó..."
                    rows={Math.min(note.text.split('\n').length || 2, 4)}
                    className="w-full bg-transparent border-none resize-none focus:ring-0 text-amber-900 font-medium leading-relaxed placeholder:text-amber-900/30 text-base outline-none mb-2 shrink-0"
                  />

                  {/* Checklist items — scrollable when long */}
                  {note.todos && note.todos.length > 0 && (
                    <div className="mt-1 border-t border-amber-900/10 pt-3 relative z-10 flex-1 overflow-y-auto min-h-0 space-y-1.5 pr-1"
                      style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(180,120,60,0.25) transparent' }}
                    >
                      {note.todos.map((todo) => (
                        <div key={todo.id} className="flex items-center gap-2 group/todo">
                          <button
                            onClick={() => toggleTodo(note.id, todo.id)}
                            className="text-amber-900/60 hover:text-amber-900 transition-colors shrink-0"
                          >
                            {todo.checked ? (
                              <CheckSquare size={16} className="text-emerald-600 fill-emerald-50" />
                            ) : (
                              <Square size={16} />
                            )}
                          </button>
                          <input
                            type="text"
                            value={todo.text}
                            onChange={(e) => updateTodoText(note.id, todo.id, e.target.value)}
                            placeholder="Nhập công việc..."
                            className={`w-full bg-transparent border-none p-0 focus:ring-0 text-xs text-amber-900 placeholder:text-amber-900/30 outline-none transition-all ${
                              todo.checked ? 'line-through text-amber-900/40 font-normal' : 'font-medium'
                            }`}
                          />
                          <button
                            onClick={() => deleteTodo(note.id, todo.id)}
                            className="p-1 text-black/20 hover:text-red-500 hover:bg-black/5 rounded-full transition-all opacity-0 group-hover/todo:opacity-100 shrink-0"
                            title="Xóa công việc"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add Checkbox Button — always pinned at bottom */}
                  <div className="mt-3 flex justify-start relative z-10 shrink-0">
                    <button
                      onClick={() => addTodo(note.id)}
                      className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-amber-800/60 hover:text-amber-900 hover:bg-black/5 px-2.5 py-1.5 rounded-xl border border-amber-900/10 transition-all bg-white/35"
                    >
                      <ListTodo size={12} />
                      <span>Thêm việc cần làm</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
};

export default LoungeBubble;

