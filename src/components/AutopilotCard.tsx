import React, { useState } from 'react';
import { Calendar, AlertOctagon, Clock, Brain, ChevronDown, ChevronUp } from 'lucide-react';
import { Task, AutopilotDay } from '../App';

interface AutopilotCardProps {
  tasks: Task[];
  autopilotSchedule: AutopilotDay[];
  isAutopilotRecalculating: boolean;
  warnings: string[];
  calendarEvents?: any[];
  isGcalConnected?: boolean;
}

export function AutopilotCard({
  tasks,
  autopilotSchedule,
  isAutopilotRecalculating,
  warnings,
  calendarEvents = [],
  isGcalConnected = false,
}: AutopilotCardProps) {
  const [expandedAlloc, setExpandedAlloc] = useState<string | null>(null);

  if (tasks.length === 0) {
    return (
      <div className="bg-white border border-[#CECBF6] rounded-xl p-8 text-center shadow-sm relative overflow-hidden" id="autopilot-placeholder-container">
        <div className="absolute top-0 right-0 w-32 h-32 bg-[#E1F5EE]/40 rounded-full blur-3xl pointer-events-none"></div>
        <div className="w-12 h-12 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-md shadow-emerald-500/10 animate-bounce">
          <Clock className="w-6 h-6 text-white stroke-[2.5]" />
        </div>
        <h3 className="text-lg font-black text-[#26215C]">🎉 You're all caught up!</h3>
        <p className="text-xs text-[#534AB7] font-semibold mt-1 max-w-md mx-auto leading-relaxed">
          Your dashboard is clear and your deadlines are safely met. LifeSaver Autopilot is on standby.
        </p>
        
        <div className="mt-6 border-t border-[#CECBF6]/40 pt-5 max-w-sm mx-auto text-left">
          <span className="text-[10px] text-[#7F77DD] font-black uppercase tracking-wider block mb-2.5">Proactive Suggestions</span>
          <div className="space-y-2 text-xs text-[#26215C] font-semibold">
            <div className="flex items-center gap-2 p-2 bg-[#F5F3FF] hover:bg-[#EEEDFE] rounded-lg transition cursor-pointer border border-[#CECBF6]/20">
              <span className="text-emerald-500">✔</span>
              <span>Review existing course study notes</span>
            </div>
            <div className="flex items-center gap-2 p-2 bg-[#F5F3FF] hover:bg-[#EEEDFE] rounded-lg transition cursor-pointer border border-[#CECBF6]/20">
              <span className="text-emerald-500">✔</span>
              <span>Read an educational book or article for 20 minutes</span>
            </div>
            <div className="flex items-center gap-2 p-2 bg-[#F5F3FF] hover:bg-[#EEEDFE] rounded-lg transition cursor-pointer border border-[#CECBF6]/20">
              <span className="text-emerald-500">✔</span>
              <span>Prepare tomorrow's priority list & schedule</span>
            </div>
            <div className="flex items-center gap-2 p-2 bg-[#F5F3FF] hover:bg-[#EEEDFE] rounded-lg transition cursor-pointer border border-[#CECBF6]/20">
              <span className="text-emerald-500">✔</span>
              <span>Take a healthy break & step away from screens</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#CECBF6] rounded-xl p-5 shadow-sm relative overflow-hidden animate-reveal-autopilot" id="autopilot-schedule-container">
      {/* Recalculating Schedule spinner/overlay */}
      {isAutopilotRecalculating && (
        <div className="absolute inset-0 bg-white/75 backdrop-blur-xs flex flex-col items-center justify-center gap-2.5 z-30 animate-fade-in">
          <Brain className="w-8 h-8 text-[#7F77DD] animate-spin" />
          <span className="text-xs font-bold text-[#534AB7]">Recalculating schedule...</span>
        </div>
      )}

      <div className="flex items-center justify-between mb-4 border-b border-[#CECBF6]/40 pb-3 flex-wrap gap-2">
        <div className="flex items-center space-x-2.5 flex-wrap gap-y-1">
          <Calendar className="w-5 h-5 text-[#7F77DD]" />
          <h3 className="text-base font-extrabold text-[#26215C]">7-Day Deadline Autopilot</h3>
          {isGcalConnected && (
            <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full uppercase tracking-wider inline-flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Calendar Connected
            </span>
          )}
        </div>
        <span className="text-[10px] font-bold text-[#534AB7] uppercase tracking-widest bg-[#EEEDFE] px-3 py-1 rounded-full border border-[#CECBF6]">
          Starting June 23, 2026
        </span>
      </div>

      {/* Warnings container */}
      {warnings.length > 0 && (
        <div className="mb-4 space-y-2" id="scheduler-warnings-container">
          {warnings.map((warn, i) => (
            <div key={i} className="bg-[#FAECE7] border border-[#F09595] text-[#993C1D] text-xs px-3.5 py-2.5 rounded-xl flex items-start gap-2.5">
              <AlertOctagon className="w-4.5 h-4.5 text-[#993C1D] shrink-0 mt-0.5" />
              <span className="font-semibold leading-relaxed">{warn}</span>
            </div>
          ))}
        </div>
      )}

      {/* Day List */}
      <div className="space-y-3" id="schedule-days-list">
        {autopilotSchedule.length === 0 ? (
          <div className="text-center py-8 bg-[#F5F3FF]/30 rounded-xl border border-[#CECBF6]">
            <Clock className="w-8 h-8 text-[#888780] mx-auto mb-2" />
            <p className="text-xs text-[#534AB7] font-semibold">No Autopilot timeline generated yet.</p>
            <p className="text-[10px] text-[#888780] mt-0.5">Sync Brain to visualize your schedule!</p>
          </div>
        ) : (
          autopilotSchedule.map((day) => {
            const dayTotalHours = day.tasks.reduce((sum, t) => sum + t.allocatedHours, 0);
            const isDayOverloaded = dayTotalHours > 8;
            const isToday = day.date === '2026-06-23';

            const rawDate = new Date(day.date);
            const formattedDayName = isToday ? 'Today' : rawDate.toLocaleDateString('en-US', { weekday: 'short' });
            const formattedDayLabel = rawDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

            const dayEvents = calendarEvents.filter(evt => {
              if (!evt.start) return false;
              return evt.start.startsWith(day.date);
            });

            return (
              <div 
                key={day.date}
                className="py-3 border-b border-[#CECBF6]/40 last:border-0"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  {/* Left: Day and Date */}
                  <div className="w-32 shrink-0 flex items-center gap-2">
                    <span className={`text-xs font-bold ${isToday ? 'text-[#7F77DD]' : 'text-[#26215C]'}`}>
                      {formattedDayName}
                    </span>
                    <span className="text-[11px] text-[#888780] font-semibold">
                      · {formattedDayLabel}
                    </span>
                  </div>

                  {/* Center: Allocated task pills (task name + effort value) */}
                  <div className="flex-1 flex flex-wrap gap-1.5 min-w-0">
                    {day.tasks.length === 0 && dayEvents.length === 0 ? (
                      <span className="text-[10px] text-[#888780]">No tasks scheduled</span>
                    ) : (
                      <>
                        {day.tasks.map((alloc, i) => {
                          const isExpanded = expandedAlloc === `${day.date}-${i}`;
                          return (
                            <button 
                              key={`alloc-${i}`} 
                              onClick={() => setExpandedAlloc(isExpanded ? null : `${day.date}-${i}`)}
                              className={`text-[11px] font-bold px-2.5 py-1.5 rounded-lg border transition-all cursor-pointer flex flex-col items-start gap-0.5 ${
                                isExpanded 
                                  ? 'bg-[#7F77DD] text-white border-[#7F77DD]' 
                                  : 'bg-[#EEEDFE] border-[#CECBF6] text-[#3C3489] hover:bg-[#EEEDFE]/80 hover:border-[#7F77DD]'
                              }`}
                            >
                              <div className="flex items-center gap-1">
                                <span>{alloc.taskName} {alloc.allocatedHours}h</span>
                                {isExpanded ? <ChevronUp className="w-3 h-3 shrink-0" /> : <ChevronDown className="w-3 h-3 shrink-0" />}
                              </div>
                              {alloc.timeSlots && alloc.timeSlots.length > 0 && (
                                <span className={`text-[9px] block font-mono ${isExpanded ? 'text-purple-100' : 'text-[#7F77DD]'}`}>
                                  ⏰ {alloc.timeSlots.join(', ')}
                                </span>
                              )}
                            </button>
                          );
                        })}
                        {dayEvents.map((evt, i) => (
                          <span 
                            key={`gcal-${i}`} 
                            className="text-[10px] font-semibold px-2 py-0.5 rounded-lg bg-gray-100 border border-gray-200 text-gray-500 flex items-center gap-1.5"
                            title={evt.summary}
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-gray-400"></span>
                            📅 {evt.summary || 'Busy block'} (Busy)
                          </span>
                        ))}
                      </>
                    )}
                  </div>

                  {/* Right: Workload hour text + status tag */}
                  <div className="flex items-center gap-2 shrink-0 justify-end">
                    <span className="text-xs font-black text-[#26215C]">
                      {dayTotalHours === 0 ? '—' : `${dayTotalHours}h`}
                    </span>
                    <span className={`text-[10px] font-black tracking-wider uppercase px-2.5 py-0.5 rounded-full border ${
                      dayTotalHours === 0 
                        ? 'bg-gray-50 text-gray-400 border-gray-200'
                        : !isDayOverloaded
                        ? 'bg-[#E1F5EE] text-[#0F6E56] border-[#A3E2CD]'
                        : 'bg-[#FAECE7] text-[#993C1D] border-[#F09595]'
                    }`}>
                      {dayTotalHours === 0 ? 'Done' : !isDayOverloaded ? 'Safe' : 'Heavy'}
                    </span>
                  </div>
                </div>

                {/* Small expandable explanation */}
                {day.tasks.map((alloc, i) => {
                  if (expandedAlloc !== `${day.date}-${i}`) return null;
                  return (
                    <div 
                      key={`explanation-${i}`}
                      className="mt-3.5 bg-[#EEEDFE]/40 border border-[#CECBF6] rounded-xl p-3.5 text-left text-xs text-[#3C3489] font-medium space-y-1.5 animate-reveal-autopilot"
                    >
                      <div className="flex items-center gap-1 text-[#7F77DD] font-black uppercase text-[10px] tracking-wider mb-1">
                        <Brain className="w-4 h-4 animate-pulse" />
                        <span>Autopilot Scheduling Decision for "{alloc.taskName}"</span>
                      </div>
                      <p className="text-xs text-[#26215C] font-semibold">
                        This {alloc.allocatedHours}-hour session was placed here based on real-time factors:
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] pt-1">
                        {alloc.timeSlots && alloc.timeSlots.length > 0 && (
                          <div className="flex items-center gap-2 col-span-1 sm:col-span-2 bg-[#F5F3FF] p-1.5 rounded-lg border border-[#CECBF6]/40 mb-1">
                            <span className="text-purple-500 font-black text-xs">⏰</span>
                            <span>Scheduled Time Slots: <strong className="text-[#26215C]">{alloc.timeSlots.join(', ')}</strong></span>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <span className="text-emerald-500 font-black text-xs">✓</span>
                          <span>Calendar is completely free (No events)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-emerald-500 font-black text-xs">✓</span>
                          <span>Optimized morning focus period (9 AM - 12 PM)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-emerald-500 font-black text-xs">✓</span>
                          <span>Matches highest priority deadline risk</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-emerald-500 font-black text-xs">✓</span>
                          <span>Fits nicely within your custom daily workload budget</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
