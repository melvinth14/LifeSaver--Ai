import React, { useRef, useEffect } from 'react';
import { 
  Sparkles, 
  Send, 
  AlertOctagon, 
  Mic, 
  MicOff 
} from 'lucide-react';
import { Message } from '../App';

interface CoachSidebarProps {
  messages: Message[];
  inputMessage: string;
  setInputMessage: (msg: string) => void;
  isSending: boolean;
  handleSendMessage: (customContent?: string) => void;
  handlePanicMode: () => void;
  isPanicLoading: boolean;
  handleVoiceDump: () => void;
  isRecordingVoice: boolean;
  isProcessingVoice: boolean;
}

export function CoachSidebar({
  messages,
  inputMessage,
  setInputMessage,
  isSending,
  handleSendMessage,
  handlePanicMode,
  isPanicLoading,
  handleVoiceDump,
  isRecordingVoice,
  isProcessingVoice,
}: CoachSidebarProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

  return (
    <aside className="w-full lg:w-[320px] lg:shrink-0 bg-white border border-[#CECBF6] rounded-xl overflow-hidden flex flex-col h-[750px] shadow-sm relative" id="coach-companion-column">
      {/* 1. Coach Avatar Header */}
      <div className="bg-[#F5F3FF] p-4 border-b border-[#CECBF6] flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-2xl bg-[#EEEDFE] flex items-center justify-center border border-[#CECBF6]">
              <Sparkles className="w-5 h-5 text-[#7F77DD]" />
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div>
          </div>
          <div>
            <h3 className="text-sm font-bold text-[#26215C] flex items-center gap-1.5">
              Coach LifeSaver
            </h3>
            <span className="text-[10px] text-green-600 flex items-center gap-1 font-semibold uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse"></span>
              Online & Active
            </span>
          </div>
        </div>
      </div>

      {/* 2. Core Chat Scroll Pane */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-[#CECBF6]" id="chat-messages-container">
        {messages.map((msg, i) => (
          <div 
            key={msg.id || i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}
          >
            <div className={`max-w-[85%] rounded-2xl p-3.5 ${
              msg.role === 'user' 
                ? 'bg-[#7F77DD] text-white font-semibold shadow-sm rounded-br-none' 
                : 'bg-[#EEEDFE] border border-[#CECBF6] leading-relaxed text-xs text-[#3C3489] rounded-bl-none'
            }`}>
              <p className="whitespace-pre-line text-[9px] font-black uppercase tracking-wider mb-1 opacity-80">
                {msg.role === 'user' ? 'You' : 'LifeSaver AI'}
              </p>
              <p className="text-xs leading-relaxed font-semibold">
                {msg.content}
              </p>
            </div>
          </div>
        ))}
        {isSending && (
          <div className="flex justify-start">
            <div className="bg-[#EEEDFE] border border-[#CECBF6] rounded-2xl rounded-bl-none p-3.5 max-w-[80%] flex items-center gap-3 shadow-sm">
              <div className="flex space-x-1.5 shrink-0">
                <span className="w-2 h-2 bg-[#7F77DD] rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                <span className="w-2 h-2 bg-[#7F77DD] rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                <span className="w-2 h-2 bg-[#7F77DD] rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
              </div>
              <span className="text-[10px] text-[#534AB7] font-bold uppercase tracking-wider">Coach is analyzing...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 3. Panic & Voice Dump Buttons (Coral and Teal) */}
      <div className="px-4 py-2 border-t border-[#CECBF6] bg-white flex flex-col gap-1.5 shrink-0">
        <button 
          onClick={handlePanicMode}
          disabled={isPanicLoading}
          className={`w-full py-2 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition duration-200 cursor-pointer shadow-xs border ${
            isPanicLoading 
              ? 'bg-rose-50 text-rose-300 border-rose-200 animate-pulse' 
              : 'bg-[#FAECE7] hover:bg-[#fae2db] border-[#F09595] text-[#993C1D]'
          }`}
        >
          <AlertOctagon className={`w-3.5 h-3.5 text-[#993C1D] ${isPanicLoading ? 'animate-spin' : ''}`} />
          {isPanicLoading ? 'Analyzing...' : 'Panic Mode'}
        </button>
        <button 
          onClick={handleVoiceDump}
          disabled={isProcessingVoice}
          className={`w-full py-2 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition duration-200 cursor-pointer shadow-xs border ${
            isRecordingVoice 
              ? 'bg-rose-100 hover:bg-rose-200 border-rose-400 text-rose-700 animate-pulse ring-4 ring-rose-200' 
              : isProcessingVoice 
              ? 'bg-emerald-50 text-emerald-300 border-emerald-200 animate-pulse' 
              : 'bg-[#E1F5EE] hover:bg-[#d0f0e5] border-[#A3E2CD] text-[#0F6E56]'
          }`}
        >
          {isRecordingVoice ? (
            <>
              <span className="w-2 h-2 bg-rose-600 rounded-full animate-ping mr-0.5"></span>
              <MicOff className="w-3.5 h-3.5 text-rose-700" />
              <span>Stop Voice Dump</span>
            </>
          ) : isProcessingVoice ? (
            <>
              <Sparkles className="w-3.5 h-3.5 text-emerald-600 animate-spin" />
              <span>Extracting Tasks...</span>
            </>
          ) : (
            <>
              <Mic className="w-3.5 h-3.5 text-[#0F6E56]" />
              <span>Voice Dump</span>
            </>
          )}
        </button>
      </div>

      {/* 4. Quick-reply Suggestion Chips */}
      <div className="p-2 bg-white border-t border-[#CECBF6] flex gap-1.5 overflow-x-auto whitespace-nowrap scrollbar-none shrink-0" id="quick-chat-chips">
        <button 
          onClick={() => handleSendMessage("I'm starting to panic. I have too much study work on Friday and an essay due Monday.")}
          className="px-2.5 py-1 rounded-lg bg-[#FAECE7] hover:bg-[#fae2db] border border-[#F09595] text-[10px] font-bold text-[#993C1D] cursor-pointer transition shrink-0"
        >
          🚨 Panic!
        </button>
        <button 
          onClick={() => handleSendMessage("Help me write an email draft asking for an extension.")}
          className="px-2.5 py-1 rounded-lg bg-[#EEEDFE] hover:bg-[#e4e2fd] border border-[#CECBF6] text-[10px] font-bold text-[#3C3489] cursor-pointer transition shrink-0"
        >
          ✉️ Ask Extension
        </button>
        <button 
          onClick={() => handleSendMessage("Organize school exam on Physics Saturday (6h study effort) and work budget analysis by Thursday (3h work effort).")}
          className="px-2.5 py-1 rounded-lg bg-[#E1F5EE] hover:bg-[#d0f0e5] border border-[#A3E2CD] text-[10px] font-bold text-[#0F6E56] cursor-pointer transition shrink-0"
        >
          🎤 Raw Voice Dump
        </button>
      </div>

      {/* 5. Chat Input */}
      <div className="p-3 bg-white border-t border-[#CECBF6] flex gap-2 shrink-0">
        <input
          type="text"
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          placeholder="Ask LifeSaver..."
          className="flex-1 bg-[#F5F3FF] border border-[#CECBF6] focus:border-[#7F77DD] rounded-xl px-3 py-2 text-xs placeholder:text-[#888780] focus:outline-none min-w-0 font-semibold focus:bg-white transition"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleSendMessage();
            }
          }}
        />
        <button
          onClick={() => handleSendMessage()}
          disabled={isSending || !inputMessage.trim()}
          className="w-8 h-8 bg-[#7F77DD] hover:bg-[#6b62ce] text-white rounded-xl flex items-center justify-center shrink-0 shadow-xs active:scale-95 transition cursor-pointer disabled:opacity-40"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </aside>
  );
}
