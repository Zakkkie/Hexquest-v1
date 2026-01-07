
import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import { useGameStore } from '../store';
import { BrainCircuit, Send, X, MessageSquare, Loader2, Sparkles } from 'lucide-react';

const GameAdvisor: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<{role: 'user' | 'model', text: string}[]>([
    { role: 'model', text: 'Tactical Advisor Online. I have access to real-time telemetry. How can I assist with your expansion strategy?' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  // Access game state for context
  const gameState = useGameStore();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    
    const userMsg = input;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setLoading(true);

    try {
      // Construct a lean context object
      const nearbyHexes = Object.values(gameState.grid)
        .filter(h => {
             // Simple Manhattan-ish distance or just raw coords to keep it light
             const dq = h.q - gameState.player.q;
             const dr = h.r - gameState.player.r;
             // Distance from player
             const dist = (Math.abs(dq) + Math.abs(dq + dr) + Math.abs(dr)) / 2;
             return dist <= 3; // Radius 3 context
        })
        .map(h => ({
            id: h.id,
            pos: {q: h.q, r: h.r},
            level: `${h.currentLevel}/${h.maxLevel}`,
            progress: h.progress,
            locked: h.maxLevel > gameState.player.playerLevel
        }));

      const contextData = {
        turn: gameState.currentTurn,
        player: {
          credits: gameState.player.coins,
          moves: gameState.player.moves,
          rank: gameState.player.playerLevel,
          pos: { q: gameState.player.q, r: gameState.player.r },
          upgradeCycle: `${gameState.player.recentUpgrades.length}/3`
        },
        opponentStats: {
            credits: gameState.bot.coins,
            rank: gameState.bot.playerLevel
        },
        immediateSurroundings: nearbyHexes
      };

      const systemInstruction = `
        You are the HexQuest Strategic AI. The game is a turn-based hex strategy.
        Goal: Expand territory, manage credits/moves, and outpace the Sentinel AI.
        
        Rules:
        - Moving costs 1 Move or 2 Credits.
        - To grow a hex (Level Up), you need time (seconds).
        - To break a record (Increase Max Level), you need a full Upgrade Cycle (3 L1 captures).
        - You cannot enter hexes with Max Level > Player Rank.
        
        Provide concise, tactical advice. Use bullet points for plans.
      `;

      const prompt = `
        [CURRENT TELEMETRY]
        ${JSON.stringify(contextData, null, 2)}
        
        [COMMANDER QUERY]
        ${userMsg}
      `;

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: prompt,
        config: {
          systemInstruction: systemInstruction,
          thinkingConfig: { thinkingBudget: 32768 }
        }
      });

      const text = response.text || "Unable to compute strategy.";
      setMessages(prev => [...prev, { role: 'model', text }]);

    } catch (e) {
      console.error(e);
      setMessages(prev => [...prev, { role: 'model', text: "ERROR: Uplink to Strategy Core failed." }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="fixed bottom-8 right-8 z-50 flex flex-col items-end pointer-events-auto">
      
      {/* Chat Window */}
      {isOpen && (
        <div className="mb-4 w-96 h-[500px] bg-slate-950/95 backdrop-blur-xl border border-cyan-500/30 rounded-2xl shadow-[0_0_50px_rgba(6,182,212,0.15)] flex flex-col overflow-hidden animate-in slide-in-from-bottom-5 fade-in duration-200">
          
          {/* Header */}
          <div className="p-4 border-b border-cyan-900/50 bg-cyan-950/20 flex justify-between items-center">
            <div className="flex items-center gap-2">
               <BrainCircuit className="w-5 h-5 text-cyan-400" />
               <span className="font-bold text-cyan-100 text-sm tracking-widest uppercase">Strategy Core</span>
            </div>
            <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl p-3 text-xs leading-relaxed ${
                  m.role === 'user' 
                    ? 'bg-cyan-600/20 border border-cyan-500/30 text-cyan-50 rounded-br-none' 
                    : 'bg-slate-800/50 border border-slate-700 text-slate-300 rounded-bl-none'
                }`}>
                  {m.text.split('\n').map((line, idx) => (
                     <React.Fragment key={idx}>
                       {line}
                       {idx < m.text.split('\n').length - 1 && <br />}
                     </React.Fragment>
                  ))}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                 <div className="bg-slate-800/50 border border-slate-700 rounded-2xl rounded-bl-none p-3 flex items-center gap-2 text-xs text-cyan-400">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span className="animate-pulse">Thinking (High Compute)...</span>
                 </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="p-3 bg-black/20 border-t border-cyan-900/30">
            <div className="relative">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask for strategy or game mechanics..."
                className="w-full bg-slate-900/50 border border-slate-700 rounded-xl pl-4 pr-10 py-3 text-xs text-white focus:outline-none focus:border-cyan-500/50 focus:bg-slate-900 transition-all placeholder:text-slate-600"
                autoFocus
              />
              <button 
                onClick={handleSend}
                disabled={loading || !input.trim()}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Send className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toggle Button */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={`group flex items-center justify-center w-14 h-14 rounded-full shadow-2xl border transition-all duration-300 ${
          isOpen 
            ? 'bg-cyan-600 border-cyan-400 rotate-90 scale-90' 
            : 'bg-slate-900/80 border-cyan-500/50 hover:border-cyan-400 hover:bg-cyan-950/80 hover:scale-110'
        }`}
      >
        {isOpen ? (
          <X className="w-6 h-6 text-white" />
        ) : (
          <div className="relative">
             <BrainCircuit className="w-7 h-7 text-cyan-400 group-hover:text-cyan-200 transition-colors" />
             <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-cyan-500 rounded-full animate-pulse shadow-[0_0_10px_#06b6d4]"></div>
          </div>
        )}
      </button>

    </div>
  );
};

export default GameAdvisor;
