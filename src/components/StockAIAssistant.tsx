import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, X, Send, Settings, Key, HelpCircle, Bot, User, AlertCircle } from 'lucide-react';

interface IngredientRow {
  id: string;
  name: string;
  unit: string;
  min_stock: number | null;
  category_name: string | null;
  stock_in_store: number | null;
  stock_in_counter: number | null;
  actual_stock: number | null;
  theoretical_stock: number | null;
  audit_date: string | null;
  monthly_variance: number;
  current_actual: number | null;
}

interface StockAIAssistantProps {
  rows: IngredientRow[];
  recentTransactions: any[];
  selectedMonth: string;
}

interface Message {
  role: 'user' | 'model';
  content: string;
  timestamp: Date;
}

export const StockAIAssistant: React.FC<StockAIAssistantProps> = ({
  rows,
  recentTransactions,
  selectedMonth,
}) => {
  const GEMINI_MODELS = [
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (Mới nhất)' },
    { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
    { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash (Cũ)' },
  ];

  const [isOpen, setIsOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [geminiModel, setGeminiModel] = useState('gemini-2.5-flash');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'model',
      content: `Xin chào! Tôi là Trợ lý AI Kho hàng của bạn. 📊\n\nTôi đã tải thành công dữ liệu kho và lịch sử giao dịch của **tháng ${selectedMonth}**. Bạn có thể hỏi tôi:\n- *Nguyên liệu nào bị âm ngày nào?*\n- *Sữa đặc/Sữa tươi bị hao hụt thế nào?*\n- *Tổng quan tình hình hao hụt & tồn kho tháng này.*`,
      timestamp: new Date(),
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load API Key & model from localStorage on mount
  useEffect(() => {
    const savedKey = localStorage.getItem('gemini_api_key') || '';
    const savedModel = localStorage.getItem('gemini_model') || 'gemini-2.5-flash';
    setApiKey(savedKey);
    setGeminiModel(savedModel);
    if (!savedKey) {
      setShowSettings(true);
    }
  }, []);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSaveApiKey = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('gemini_api_key', apiKey.trim());
    localStorage.setItem('gemini_model', geminiModel);
    setShowSettings(false);
    setErrorMsg('');
  };

  const handleQuickQuestion = (question: string) => {
    if (isLoading) return;
    setInput(question);
    sendMessage(question);
  };

  const sendMessage = async (textToSend?: string) => {
    const query = (textToSend || input).trim();
    if (!query) return;

    const savedKey = localStorage.getItem('gemini_api_key') || '';
    if (!savedKey) {
      setErrorMsg('Vui lòng cài đặt Gemini API Key trước khi trò chuyện!');
      setShowSettings(true);
      return;
    }

    if (!textToSend) {
      setInput('');
    }

    const newMessages: Message[] = [...messages, { role: 'user', content: query, timestamp: new Date() }];
    setMessages(newMessages);
    setIsLoading(true);
    setErrorMsg('');

    // Context formatting
    // Limit transaction count to prevent context blowup, but sort them so latest / important ones are preserved
    const truncatedTransactions = recentTransactions.slice(0, 150).map(t => ({
      date: t.transaction_date,
      type: t.type,
      qty: t.quantity,
      ingredient: t.ingredients?.name || t.ingredient_id,
    }));

    const stockSummary = rows.map(r => ({
      name: r.name,
      unit: r.unit,
      min: r.min_stock,
      theoretical: r.theoretical_stock,
      actual: r.current_actual,
      variance: r.monthly_variance,
    }));

    const promptContext = `
Dữ liệu tồn kho và lịch sử giao dịch tháng này (${selectedMonth}):
- Tồn kho hiện tại (stockSummary): ${JSON.stringify(stockSummary)}
- Lịch sử giao dịch chi tiết (recentTransactions - giới hạn 150 giao dịch gần nhất): ${JSON.stringify(truncatedTransactions)}

Câu hỏi từ quản lý kho: "${query}"

Yêu cầu đối với AI:
1. Bạn là Trợ lý AI Quản lý Kho thông minh, làm việc tại quán Cà phê. Hãy trả lời thân thiện, lịch sự và chuyên nghiệp bằng Tiếng Việt.
2. Dựa vào dữ liệu lịch sử giao dịch và hao hụt để chỉ ra chính xác các mốc thời gian, số lượng nguyên liệu bị biến động âm/dương hoặc hao hụt thất thoát theo câu hỏi.
3. Nếu không tìm thấy thông tin cụ thể trong dữ liệu, hãy trả lời trung thực là không có dữ liệu giao dịch đó thay vì tự bịa ra thông tin.
4. Trình bày nội dung đẹp mắt bằng Markdown (sử dụng in đậm, danh sách gạch đầu dòng, bảng số liệu nếu cần, và chèn các emoji phù hợp để dễ đọc).
`;

    // Try models in order: saved preference first, then fallbacks
    const savedModel = localStorage.getItem('gemini_model') || 'gemini-2.5-flash';
    const fallbackChain = [
      savedModel,
      ...['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'].filter(m => m !== savedModel),
    ];

    let lastError: string | null = null;
    let answered = false;

    for (const modelId of fallbackChain) {
      try {
        // Try v1 first, fallback to v1beta
        for (const apiVersion of ['v1', 'v1beta']) {
          const response = await fetch(
            `https://generativelanguage.googleapis.com/${apiVersion}/models/${modelId}:generateContent?key=${savedKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: promptContext }] }],
                generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
              }),
            }
          );

          if (!response.ok) {
            const errorData = await response.json();
            lastError = errorData.error?.message || 'Lỗi không xác định';
            continue; // try next api version
          }

          const resData = await response.json();
          const answer = resData.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!answer) { lastError = 'Không có phản hồi từ mô hình AI.'; continue; }

          setMessages(prev => [
            ...prev,
            { role: 'model', content: answer, timestamp: new Date() },
          ]);
          answered = true;
          break;
        }
        if (answered) break;
      } catch (err: any) {
        lastError = err.message;
      }
    }

    if (!answered) {
      setErrorMsg(`Không thể kết nối API Gemini. Vui lòng kiểm tra lại API Key hoặc thử đổi model khác trong cài đặt. Chi tiết: ${lastError}`);
    }
    setIsLoading(false);
  };

  const renderMessageContent = (content: string) => {
    // Simple markdown link & styling rendering
    return content.split('\n').map((line, lineIdx) => {
      let trimmed = line;
      let isBullet = false;

      if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        trimmed = trimmed.substring(2);
        isBullet = true;
      }

      // Replace bold **text** with strong tags
      const parts = [];
      let lastIndex = 0;
      const boldRegex = /\*\*(.*?)\*\*/g;
      let match;

      while ((match = boldRegex.exec(trimmed)) !== null) {
        if (match.index > lastIndex) {
          parts.push(trimmed.substring(lastIndex, match.index));
        }
        parts.push(<strong key={match.index} className="font-extrabold text-teal-800">{match[1]}</strong>);
        lastIndex = boldRegex.lastIndex;
      }
      if (lastIndex < trimmed.length) {
        parts.push(trimmed.substring(lastIndex));
      }

      const contentNode = parts.length > 0 ? parts : trimmed;

      if (isBullet) {
        return (
          <li key={lineIdx} className="ml-4 list-disc text-sm text-gray-700 my-1">
            {contentNode}
          </li>
        );
      }

      return (
        <p key={lineIdx} className="text-sm text-gray-700 my-1 leading-relaxed min-h-[1em]">
          {contentNode}
        </p>
      );
    });
  };

  return (
    <>
      {/* FLOATING TRIGGER BUTTON */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-50 bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700 text-white rounded-full p-4 shadow-2xl shadow-teal-500/30 flex items-center justify-center border border-white/20 transition-all duration-300 hover:scale-110 active:scale-95 group animate-bounce"
        style={{ animationDuration: '3s' }}
        title="Trợ lý AI Tồn kho"
      >
        <Sparkles size={24} className="group-hover:rotate-12 transition-transform" />
        <span className="max-w-0 overflow-hidden group-hover:max-w-xs transition-all duration-500 ease-in-out font-black text-xs uppercase tracking-widest whitespace-nowrap ml-0 group-hover:ml-2">
          Hỏi Trợ lý AI
        </span>
      </button>

      {/* CHAT WINDOW */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 w-[420px] max-w-[calc(100vw-2rem)] h-[600px] max-h-[calc(100vh-8rem)] bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/50 flex flex-col overflow-hidden z-50 animate__animated animate__fadeInUp animate__faster premium-shadow">
          {/* HEADER */}
          <div className="bg-gradient-to-r from-teal-600 to-emerald-600 p-4 text-white flex justify-between items-center shadow-md">
            <div className="flex items-center gap-3">
              <div className="bg-white/20 p-2 rounded-2xl backdrop-blur-md border border-white/10">
                <Bot size={22} className="text-white" />
              </div>
              <div>
                <h6 className="font-extrabold text-sm tracking-wide uppercase mb-0 flex items-center gap-1.5">
                  Trợ lý AI Tồn kho
                </h6>
                <span className="text-[10px] text-teal-100 font-bold uppercase tracking-widest flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-emerald-300 rounded-full animate-pulse"></span>
                  {GEMINI_MODELS.find(m => m.id === geminiModel)?.label || 'Gemini AI'}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowSettings(!showSettings)}
                className={`p-2 rounded-xl transition-all ${
                  showSettings ? 'bg-white/25 text-white' : 'hover:bg-white/10 text-teal-100 hover:text-white'
                }`}
                title="Cài đặt API Key"
              >
                <Settings size={18} />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-2 hover:bg-white/10 rounded-xl text-teal-100 hover:text-white transition-all"
                title="Đóng"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* MAIN CONTENT AREA */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 relative">
            {/* SETTINGS LAYER */}
            {showSettings ? (
              <div className="absolute inset-0 bg-white/95 z-10 p-5 flex flex-col justify-between animate__animated animate__fadeIn animate__faster">
                <div>
                  <div className="flex items-center gap-2 mb-3 text-teal-600">
                    <Key size={20} className="stroke-[2.5]" />
                    <h6 className="font-black text-sm uppercase tracking-wide mb-0">Cấu hình Gemini API Key</h6>
                  </div>
                  <p className="text-xs text-gray-500 leading-relaxed mb-4">
                    Để sử dụng tính năng AI phân tích tồn kho miễn phí, bạn cần sử dụng <strong>Gemini API Key</strong> của riêng mình. 
                    Dữ liệu được lưu cục bộ trên thiết bị của bạn.
                  </p>
                  
                  <form onSubmit={handleSaveApiKey}>
                    <div className="mb-3">
                      <label className="text-[10px] text-gray-400 font-black uppercase tracking-widest block mb-2">API Key của bạn</label>
                      <input
                        type="password"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder="AIzaSy..."
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-xs font-mono outline-none focus:border-teal-500 focus:bg-white transition-all"
                        required
                      />
                    </div>
                    <div className="mb-4">
                      <label className="text-[10px] text-gray-400 font-black uppercase tracking-widest block mb-2">Chọn Model AI</label>
                      <select
                        value={geminiModel}
                        onChange={(e) => setGeminiModel(e.target.value)}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-xs font-bold outline-none focus:border-teal-500 focus:bg-white transition-all"
                      >
                        {GEMINI_MODELS.map(m => (
                          <option key={m.id} value={m.id}>{m.label}</option>
                        ))}
                      </select>
                      <p className="text-[9px] text-gray-400 mt-1.5 leading-relaxed">
                        💡 Nếu gặp lỗi, hệ thống sẽ tự động thử model dự phòng khác.
                      </p>
                    </div>
                    <button
                      type="submit"
                      className="w-full bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700 text-white font-black text-xs uppercase tracking-widest py-3 px-4 rounded-2xl shadow-lg transition-all"
                    >
                      Lưu cấu hình
                    </button>
                  </form>
                </div>

                <div className="bg-teal-50/50 border border-teal-100/50 p-4 rounded-2xl flex gap-3">
                  <HelpCircle className="text-teal-600 shrink-0" size={18} />
                  <div className="text-xs text-gray-600 leading-relaxed">
                    <strong className="text-teal-800 block mb-0.5">Cách lấy Key miễn phí:</strong>
                    1. Truy cập <a href="https://aistudio.google.com/" target="_blank" rel="noreferrer" className="text-teal-600 underline font-bold">Google AI Studio</a>.<br />
                    2. Đăng nhập tài khoản Google của bạn.<br />
                    3. Nhấn nút <strong>Create API Key</strong> và sao chép mã Key dán vào đây.
                  </div>
                </div>
              </div>
            ) : null}

            {/* MESSAGES LIST */}
            {messages.map((msg, index) => {
              const isAI = msg.role === 'model';
              return (
                <div
                  key={index}
                  className={`flex gap-3 max-w-[85%] ${isAI ? 'self-start' : 'self-end flex-row-reverse'}`}
                >
                  <div
                    className={`w-8 h-8 rounded-2xl flex items-center justify-center shrink-0 shadow-sm border ${
                      isAI
                        ? 'bg-teal-50 text-teal-600 border-teal-100'
                        : 'bg-emerald-500 text-white border-emerald-400'
                    }`}
                  >
                    {isAI ? <Bot size={16} /> : <User size={16} />}
                  </div>
                  <div className="flex flex-col">
                    <div
                      className={`px-4 py-3 rounded-3xl ${
                        isAI
                          ? 'bg-gray-50 text-gray-800 rounded-tl-none border border-gray-100'
                          : 'bg-gradient-to-br from-teal-500 to-emerald-600 text-white rounded-tr-none'
                      }`}
                    >
                      {isAI ? (
                        <div className="space-y-1">{renderMessageContent(msg.content)}</div>
                      ) : (
                        <p className="text-sm my-0 leading-relaxed font-semibold">{msg.content}</p>
                      )}
                    </div>
                    <span className="text-[9px] text-gray-400 font-medium mt-1 self-start px-2">
                      {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              );
            })}

            {/* LOADING STATE */}
            {isLoading && (
              <div className="flex gap-3 max-w-[85%] self-start">
                <div className="w-8 h-8 rounded-2xl flex items-center justify-center shrink-0 shadow-sm border bg-teal-50 text-teal-600 border-teal-100">
                  <Bot size={16} />
                </div>
                <div className="px-4 py-3 rounded-3xl bg-gray-50 border border-gray-100 rounded-tl-none flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 bg-teal-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-1.5 h-1.5 bg-teal-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-1.5 h-1.5 bg-teal-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
              </div>
            )}

            {/* ERROR ALERT */}
            {errorMsg && (
              <div className="bg-red-50 border border-red-100 rounded-2xl p-3 flex items-start gap-2.5 text-red-600 text-xs my-2 animate__animated animate__shakeX">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Lỗi:</span> {errorMsg}
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* QUICK SUGGESTIONS */}
          {!showSettings && messages.length <= 2 && (
            <div className="px-4 py-2 flex flex-wrap gap-2 border-t border-gray-100 bg-gray-50/50">
              <button
                onClick={() => handleQuickQuestion('Có sữa tươi nào bị âm không?')}
                className="text-[10px] font-black uppercase tracking-wider text-teal-600 bg-white hover:bg-teal-50 px-2.5 py-1.5 rounded-xl border border-gray-100 transition-all"
              >
                🔍 Check sữa tươi bị âm?
              </button>
              <button
                onClick={() => handleQuickQuestion('Tổng quan hao hụt tháng này thế nào?')}
                className="text-[10px] font-black uppercase tracking-wider text-teal-600 bg-white hover:bg-teal-50 px-2.5 py-1.5 rounded-xl border border-gray-100 transition-all"
              >
                📊 Tổng quan hao hụt?
              </button>
            </div>
          )}

          {/* INPUT FORM */}
          <div className="p-4 bg-white border-t border-gray-100 flex gap-2 items-center">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder={showSettings ? 'Vui lòng lưu API Key trước...' : 'Hỏi trợ lý kho...'}
              disabled={showSettings || isLoading}
              className="flex-1 px-4 py-3 bg-gray-50 border border-gray-100 focus:border-teal-500 focus:bg-white rounded-2xl text-xs font-semibold outline-none transition-all disabled:opacity-50"
            />
            <button
              onClick={() => sendMessage()}
              disabled={showSettings || isLoading || !input.trim()}
              className="bg-teal-500 hover:bg-teal-600 disabled:bg-gray-100 text-white disabled:text-gray-400 p-3 rounded-2xl shadow-md transition-all flex items-center justify-center shrink-0"
              title="Gửi tin nhắn"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      )}
    </>
  );
};
