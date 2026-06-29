import React from 'react';
import { Task } from '../App';
import { AlertTriangle, Clock, ListTodo, Calendar, ShieldCheck, Gauge } from 'lucide-react';

interface StatCardsProps {
  tasks: Task[];
  pressureScore: number;
}

export function StatCards({ tasks, pressureScore }: StatCardsProps) {
  const activeTasks = tasks.filter(t => !t.completed);
  const totalIncompleteHours = activeTasks.reduce((sum, t) => sum + t.estimatedEffort, 0);

  // Calculate next deadline info
  const activeTasksWithDeadlines = activeTasks.filter(t => t.deadline);
  const nextTask = activeTasksWithDeadlines.length > 0
    ? [...activeTasksWithDeadlines].sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime())[0]
    : null;

  let deadlineDay = 'None';
  let deadlineSub = 'No upcoming deadlines';
  if (nextTask) {
    const dt = new Date(nextTask.deadline);
    deadlineDay = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const timeStr = dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const tasksOnSameDay = activeTasks.filter(t => t.deadline && t.deadline.split('T')[0] === nextTask.deadline.split('T')[0]).length;
    deadlineSub = `${timeStr} · ${tasksOnSameDay} task${tasksOnSameDay > 1 ? 's' : ''}`;
  }

  // Calculate dynamic workload risk values
  const availableHours = 24; // Standard available focused budget for upcoming days
  const requiredHours = totalIncompleteHours;
  const riskLevel = pressureScore < 4 ? 'Low' : pressureScore < 7 ? 'Medium' : 'High';
  const overloadedBy = Math.max(0, requiredHours - availableHours);
  const progressPercent = Math.min(100, Math.round((requiredHours / availableHours) * 100));

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-5" id="top-dashboard-widgets">
      {/* Improved Card 1: Workload Risk Indicator */}
      <div className="bg-white border border-[#CECBF6] p-5 rounded-xl flex flex-col justify-between shadow-sm min-h-[140px]" id="pressure-stat-card">
        <div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-extrabold tracking-widest text-[#888780]">Workload Risk</span>
            <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black tracking-wide uppercase border ${
              riskLevel === 'Low' ? 'bg-[#E1F5EE] text-[#0F6E56] border-[#A3E2CD]' :
              riskLevel === 'Medium' ? 'bg-amber-50 text-amber-800 border-amber-200' :
              'bg-[#FAECE7] text-[#993C1D] border-[#F09595] animate-pulse'
            }`}>
              {riskLevel} Risk
            </span>
          </div>
          
          <div className="grid grid-cols-2 gap-2 mt-3 text-left">
            <div>
              <span className="text-[9px] text-[#888780] font-bold block">Required</span>
              <span className="text-sm font-black text-[#26215C] flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-[#7F77DD]" />
                {requiredHours} hrs
              </span>
            </div>
            <div>
              <span className="text-[9px] text-[#888780] font-bold block">Available</span>
              <span className="text-sm font-black text-[#26215C] flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-[#0F6E56]" />
                {availableHours} hrs
              </span>
            </div>
          </div>

          {/* Simple progress indicator */}
          <div className="mt-3">
            <div className="w-full bg-[#EEEDFE] rounded-full h-2">
              <div 
                className={`h-2 rounded-full transition-all duration-500 ${
                  riskLevel === 'Low' ? 'bg-emerald-500' : riskLevel === 'Medium' ? 'bg-amber-500' : 'bg-rose-500'
                }`}
                style={{ width: `${progressPercent}%` }}
              ></div>
            </div>
          </div>
        </div>

        <div className="text-[10px] text-[#888780] font-bold mt-2.5 flex items-center gap-1">
          {overloadedBy > 0 ? (
            <>
              <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
              <span>Overloaded by <strong className="text-rose-600 font-extrabold">{overloadedBy.toFixed(1)} hours</strong></span>
            </>
          ) : (
            <>
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span>Safe workload capacity remaining</span>
            </>
          )}
        </div>
      </div>

      {/* Card 2: Active Tasks */}
      <div className="bg-white border border-[#CECBF6] p-5 rounded-xl flex flex-col justify-between shadow-sm min-h-[140px]" id="active-tasks-stat-card">
        <div>
          <span className="text-[10px] uppercase font-extrabold tracking-widest text-[#888780]">Active Tasks</span>
          <div className="text-3xl font-black text-[#26215C] mt-1.5 flex items-center gap-2">
            <ListTodo className="w-6 h-6 text-[#7F77DD]" />
            {activeTasks.length}
          </div>
        </div>
        <div className="text-xs text-[#888780] font-bold truncate mt-2">
          {activeTasks.length > 0 ? activeTasks.map(t => t.name.toLowerCase()).join(' · ') : 'No active tasks'}
        </div>
      </div>

      {/* Card 3: Next Deadline */}
      <div className="bg-white border border-[#CECBF6] p-5 rounded-xl flex flex-col justify-between shadow-sm min-h-[140px]" id="next-deadline-stat-card">
        <div>
          <span className="text-[10px] uppercase font-extrabold tracking-widest text-[#888780]">Next Deadline</span>
          <div className="text-xl font-black text-[#26215C] mt-2 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-amber-500" />
            {deadlineDay}
          </div>
        </div>
        <span className="text-xs text-[#888780] font-bold mt-2">{deadlineSub}</span>
      </div>
    </div>
  );
}
