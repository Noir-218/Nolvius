import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Coffee, StickyNote, Sparkles, Clock } from 'lucide-react';

interface Note {
  id: string;
  text: string;
  color: string;
  rotation: number;
}

const COLORS = [
  '#fef3c7', // Yellow
  '#fee2e2', // Red/Pink
  '#dcfce7', // Green
  '#e0f2fe', // Blue
  '#f3e8ff', // Purple
];

const Lounge: React.FC = () => {
  const [notes, setNotes] = useState<Note[]>(() => {
    const saved = localStorage.getItem('lounge-notes');
    return saved ? JSON.parse(saved) : [
      { id: '1', text: 'Chào mừng bạn đến với Góc Thư Giãn! ☕', color: '#fef3c7', rotation: -2 },
      { id: '2', text: 'Đừng quên kiểm tra hạn sử dụng của sữa nhé.', color: '#fee2e2', rotation: 3 },
      { id: '3', text: 'Chúc bạn một ca làm việc vui vẻ! ✨', color: '#dcfce7', rotation: 1 },
    ];
  });
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    localStorage.setItem('lounge-notes', JSON.stringify(notes));
  }, [notes]);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const addNote = () => {
    const newNote: Note = {
      id: Date.now().toString(),
      text: '',
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      rotation: Math.floor(Math.random() * 10) - 5,
    };
    setNotes([newNote, ...notes]);
  };

  const updateNote = (id: string, text: string) => {
    setNotes(notes.map(n => n.id === id ? { ...n, text } : n));
  };

  const deleteNote = (id: string) => {
    setNotes(notes.filter(n => n.id !== id));
  };

  return (
    <div className="min-h-[calc(100vh-120px)] relative overflow-hidden p-8">
      {/* Background Decor */}
      <div className="absolute inset-0 bg-[#fdf8f4] -z-10" />
      <div 
        className="absolute inset-0 opacity-[0.03] pointer-events-none -z-10" 
        style={{ backgroundImage: `url('https://www.transparenttextures.com/patterns/wood-pattern.png')` }}
      />

      {/* Header Info */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-12 animate-in fade-in slide-in-from-top duration-700">
        <div>
          <h1 className="text-4xl font-black text-amber-900 tracking-tight flex items-center gap-3">
            Góc Chill Của Staff <Coffee className="text-amber-600" />
          </h1>
          <p className="text-amber-800/60 font-medium mt-1 uppercase tracking-widest text-xs">A cozy space for notes & reminders</p>
        </div>
        
        <div className="mt-4 md:mt-0 flex items-center gap-6 bg-white/60 backdrop-blur-md px-6 py-3 rounded-3xl border border-amber-100 shadow-sm">
          <div className="flex items-center gap-3 text-amber-900">
            <Clock size={20} className="text-amber-500" />
            <span className="font-black text-xl tabular-nums">
              {time.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>
          <div className="h-6 w-px bg-amber-100" />
          <div className="flex items-center gap-2 text-amber-700 font-bold">
            <Sparkles size={18} className="animate-pulse text-amber-400" />
            <span>Robert is cheering you on! 🐸</span>
          </div>
        </div>
      </div>

      {/* Notes Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
        {/* Add Note Button */}
        <button
          onClick={addNote}
          className="group relative h-64 border-4 border-dashed border-amber-200/50 rounded-3xl flex flex-col items-center justify-center gap-4 hover:border-amber-400 hover:bg-amber-50/50 transition-all duration-300"
        >
          <div className="w-16 h-16 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
            <Plus size={32} />
          </div>
          <span className="font-black text-amber-800/40 group-hover:text-amber-800 transition-colors uppercase tracking-widest text-sm">Thêm Ghi Chú</span>
        </button>

        {notes.map((note) => (
          <div
            key={note.id}
            className="relative transform transition-all hover:scale-105 hover:z-10 duration-300 group"
            style={{ transform: `rotate(${note.rotation}deg)` }}
          >
            <div 
              className="h-64 p-6 shadow-xl rounded-sm flex flex-col premium-shadow"
              style={{ backgroundColor: note.color, borderBottomRightRadius: '40px 5px' }}
            >
              {/* Note Header */}
              <div className="flex justify-between items-center mb-3">
                <StickyNote size={14} className="opacity-30" />
                <button
                  onClick={() => deleteNote(note.id)}
                  className="p-1.5 text-black/20 hover:text-red-500 hover:bg-red-50 rounded-full transition-all opacity-0 group-hover:opacity-100"
                >
                  <Trash2 size={16} />
                </button>
              </div>

              {/* Note Content */}
              <textarea
                value={note.text}
                onChange={(e) => updateNote(note.id, e.target.value)}
                placeholder="Viết gì đó..."
                className="flex-1 bg-transparent border-none resize-none focus:ring-0 text-amber-900 font-medium leading-relaxed placeholder:text-amber-900/30 text-lg italic"
                style={{ fontFamily: "'Handlee', cursive" }}
              />

              {/* Note Footer - Pin Decor */}
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-6 h-6 bg-red-500/80 rounded-full shadow-md z-10 border-2 border-white/20 ring-4 ring-red-500/10" />
            </div>
          </div>
        ))}
      </div>

      {/* Decorative Stickers (Fixed Positions) */}
      <div className="fixed bottom-10 right-10 opacity-20 pointer-events-none group hover:opacity-100 transition-opacity">
        <div className="text-8xl transform -rotate-12">🐸</div>
        <div className="absolute -top-4 -right-4 bg-white px-3 py-1 rounded-full text-xs font-black shadow-sm">ROBERT</div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Handlee&display=swap');
        
        .premium-shadow {
          box-shadow: 
            2px 4px 6px rgba(0,0,0,0.05),
            1px 1px 2px rgba(0,0,0,0.1) inset;
        }

        .animate-in {
          animation: fade-in 0.5s ease-out forwards, slide-in 0.5s ease-out forwards;
        }

        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes slide-in {
          from { transform: translateY(-20px); }
          to { transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default Lounge;
