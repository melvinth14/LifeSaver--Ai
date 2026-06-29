import React, { useState } from 'react';
import { 
  Check, 
  Calendar, 
  Clock, 
  Trash2, 
  Pencil, 
  Brain, 
  AlertTriangle, 
  FileText, 
  ChevronDown, 
  ChevronUp, 
  Sparkles 
} from 'lucide-react';
import { Task, SubTask } from '../App';

interface TaskBoardProps {
  tasks: Task[];
  filteredTasks: Task[];
  activeCategoryFilter: string;
  setActiveCategoryFilter: (cat: string) => void;
  handleToggleTaskCompleted: (task: Task) => void;
  handleDecompressTask: (task: Task) => void;
  decompressingTasks: Record<string, 'loading' | 'failed' | 'idle'>;
  handleToggleConsequences: (task: Task) => void;
  loadingConsequences: Record<string, boolean>;
  expandedConsequences: Record<string, boolean>;
  handleToggleSubtask: (task: Task, subId: string) => void;
  requestExtensionDraft: (task: Task) => void;
  handleDeleteTask: (taskId: string) => void;
  editingTaskId: string | null;
  setEditingTaskId: (id: string | null) => void;
  editForm: any;
  setEditForm: (form: any) => void;
  handleSaveEditTask: (task: Task) => void;
  handleCancelEditTask: () => void;
  taskToasts: Record<string, string>;
}

export function TaskBoard({
  tasks,
  filteredTasks,
  activeCategoryFilter,
  setActiveCategoryFilter,
  handleToggleTaskCompleted,
  handleDecompressTask,
  decompressingTasks,
  handleToggleConsequences,
  loadingConsequences,
  expandedConsequences,
  handleToggleSubtask,
  requestExtensionDraft,
  handleDeleteTask,
  editingTaskId,
  setEditingTaskId,
  editForm,
  setEditForm,
  handleSaveEditTask,
  handleCancelEditTask,
  taskToasts,
}: TaskBoardProps) {
  // Local state to manage which tasks have their subtask details expanded
  const [expandedCardIds, setExpandedCardIds] = useState<Record<string, boolean>>({});
  const [isCompletedSectionOpen, setIsCompletedSectionOpen] = useState(false);

  const activeFilteredTasks = filteredTasks.filter(t => !t.completed);
  const completedFilteredTasks = filteredTasks.filter(t => t.completed);

  const toggleCardExpansion = (taskId: string) => {
    setExpandedCardIds(prev => ({ ...prev, [taskId]: !prev[taskId] }));
  };

  const categories = [
    { id: 'all', label: 'All Tasks' },
    { id: 'study', label: 'Study' },
    { id: 'work', label: 'Work' },
    { id: 'personal', label: 'Personal' }
  ];

  return (
    <div className="bg-white border border-[#CECBF6] rounded-xl p-5 shadow-sm" id="active-tasks-board-widget">
      {/* Filter Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5 border-b border-[#CECBF6]/40 pb-4">
        <h3 className="text-base font-extrabold text-[#26215C]">Active Task Board</h3>
        
        {/* Pills */}
        <div className="flex flex-wrap gap-1.5" id="category-filter-pills">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategoryFilter(cat.id)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold uppercase transition select-none cursor-pointer ${
                activeCategoryFilter === cat.id
                  ? 'bg-[#7F77DD] text-white border border-[#7F77DD]'
                  : 'bg-[#F5F3FF] text-[#534AB7] hover:bg-[#EEEDFE] border border-[#CECBF6]'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Task Cards List */}
      <div className="space-y-4" id="task-cards-list-container">
        {activeFilteredTasks.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-[#CECBF6] shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-[#E1F5EE]/40 rounded-full blur-2xl pointer-events-none"></div>
            <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-3 border border-emerald-100">
              <Check className="w-6 h-6 text-emerald-500 stroke-[2.5]" />
            </div>
            <h3 className="text-base font-black text-[#26215C]">Your list is clear!</h3>
            <p className="text-xs text-[#534AB7] font-semibold mt-1 max-w-xs mx-auto leading-relaxed">
              "Outstanding! Everything is perfectly balanced. Your future self is thanking you."
            </p>
            <p className="text-[10px] text-[#888780] mt-3.5 bg-[#F5F3FF] inline-block px-3 py-1.5 rounded-full border border-[#CECBF6]/40 font-bold">
              💡 Pro tip: Create a study slot or ask Coach for a microstep plan.
            </p>
          </div>
        ) : (
          activeFilteredTasks.map((task) => {
            const isEditing = editingTaskId === task.id;
            const hasSteps = task.subtasks && task.subtasks.length > 0;
            const completedSteps = task.subtasks ? task.subtasks.filter(s => s.completed).length : 0;
            const totalSteps = task.subtasks ? task.subtasks.length : 0;
            const showSuccessToast = !!taskToasts[task.id];
            const isExpanded = !!expandedCardIds[task.id];

            return (
              <div 
                key={task.id}
                className={`border rounded-xl bg-white shadow-xs hover:shadow-sm transition-all overflow-hidden relative flex flex-col ${
                  task.completed 
                    ? 'border-[#CECBF6] bg-gray-50/50' 
                    : task.priority === 'high' 
                    ? 'border-[#F09595]/60 hover:border-[#F09595]' 
                    : 'border-[#CECBF6] hover:border-[#7F77DD]/70'
                }`}
                id={`task-card-${task.id}`}
              >
                {/* 1. Green Success Toast (top of the card, fades out in 3s) */}
                {showSuccessToast && (
                  <div className="bg-emerald-500 text-white text-xs font-bold py-2 px-4 flex items-center gap-1.5 animate-reveal-autopilot shrink-0">
                    <Check className="w-4 h-4 stroke-[3]" />
                    <span>{taskToasts[task.id]}</span>
                  </div>
                )}

                {/* Main Card Inner Body */}
                <div className="p-4.5 flex-1 flex flex-col gap-3">
                  
                  {/* Card Header row */}
                  <div className="flex items-start gap-3">
                    {/* Checkbox button */}
                    <button
                      onClick={() => handleToggleTaskCompleted(task)}
                      className={`w-5.5 h-5.5 border rounded-lg flex items-center justify-center transition shrink-0 mt-0.5 cursor-pointer ${
                        task.completed
                          ? 'bg-emerald-500 border-emerald-500 text-white shadow-sm'
                          : 'border-[#CECBF6] hover:border-[#7F77DD] bg-white'
                      }`}
                      id={`task-check-${task.id}`}
                    >
                      {task.completed && <Check className="w-3.5 h-3.5 text-white stroke-[3.5]" />}
                    </button>

                    {/* Task details and metadata */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-sm font-extrabold truncate ${task.completed ? 'line-through text-[#888780]' : 'text-[#26215C]'}`}>
                          {task.name}
                        </span>
                        
                        {/* Category badge */}
                        <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 bg-[#EEEDFE] border border-[#CECBF6] rounded-md text-[#534AB7]">
                          {task.category}
                        </span>

                        {/* Priority badge */}
                        <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border ${
                          task.priority === 'high'
                            ? 'bg-[#FAECE7] text-[#993C1D] border-[#F09595]'
                            : task.priority === 'medium'
                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                            : 'bg-emerald-50 text-[#0F6E56] border-[#A3E2CD]'
                        }`}>
                          {task.priority}
                        </span>
                      </div>

                      {/* Meta information row (Deadline and Effort) */}
                      <div className="flex flex-wrap items-center gap-3 mt-1.5 text-[11px] text-[#888780] font-bold">
                        {task.deadline && (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 text-[#888780]" />
                            {new Date(task.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-[#888780]" />
                          {task.estimatedEffort < 1 ? `Budget: ${Math.round(task.estimatedEffort * 60)}m` : `Budget: ${task.estimatedEffort}h`}
                        </span>
                      </div>

                      {/* Dynamic Task Progress Bar & Remaining Time Indicator */}
                      {!task.completed && (
                        <div className="mt-3.5 p-3 bg-[#F5F3FF]/50 rounded-xl border border-[#CECBF6]/40 space-y-2.5">
                          <div className="flex justify-between items-center text-[10px] font-bold">
                            <span className="text-[#534AB7] uppercase tracking-wider">Subtask Progress</span>
                            <span className="text-[#26215C] font-mono">
                              {task.subtasks && task.subtasks.length > 0 
                                ? `${task.subtasks.filter(s => s.completed).length}/${task.subtasks.length} steps`
                                : '0/1 step'} ({task.subtasks && task.subtasks.length > 0 ? Math.round((task.subtasks.filter(s => s.completed).length / task.subtasks.length) * 100) : 0}%)
                            </span>
                          </div>
                          <div className="w-full bg-[#EEEDFE] rounded-full h-1.5 overflow-hidden">
                            <div 
                              className="bg-gradient-to-r from-[#7F77DD] to-[#534AB7] h-1.5 rounded-full transition-all duration-300"
                              style={{ 
                                width: `${task.subtasks && task.subtasks.length > 0 ? Math.round((task.subtasks.filter(s => s.completed).length / task.subtasks.length) * 100) : 0}%` 
                              }}
                            ></div>
                          </div>
                          <div className="flex justify-between items-center text-[10px] font-bold text-[#888780] pt-1.5 border-t border-[#CECBF6]/20">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3 text-[#7F77DD]" />
                              Estimated Remaining Time:
                            </span>
                            <span className="text-[#26215C] font-black">
                              {task.estimatedEffort < 1 ? `${Math.round(task.estimatedEffort * 60)} mins` : `${task.estimatedEffort} hours`}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Action buttons (Edit & Delete) */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => {
                          if (isEditing) {
                            handleCancelEditTask();
                          } else {
                            setEditingTaskId(task.id);
                            setEditForm({
                              name: task.name,
                              deadline: task.deadline ? task.deadline.substring(0, 16) : '',
                              estimatedEffort: task.estimatedEffort,
                              priority: task.priority,
                              category: task.category
                            });
                          }
                        }}
                        className={`p-1.5 rounded-lg border transition cursor-pointer ${
                          isEditing
                            ? 'bg-[#EEEDFE] border-[#CECBF6] text-[#7F77DD]'
                            : 'bg-white border-transparent hover:border-[#CECBF6] text-[#888780] hover:text-[#26215C]'
                        }`}
                        title="Edit task inline"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteTask(task.id)}
                        className="p-1.5 rounded-lg bg-white border border-transparent hover:border-rose-200 hover:bg-rose-50 text-[#888780] hover:text-rose-600 transition cursor-pointer"
                        title="Delete task"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Inline Edit Form Panel (if matches editingTaskId) */}
                  {isEditing && editForm && (
                    <div className="p-4 bg-[#F5F3FF]/60 border border-[#CECBF6] rounded-xl space-y-4 animate-reveal-autopilot">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="sm:col-span-2">
                          <label className="block text-[10px] uppercase tracking-wider text-[#534AB7] font-bold mb-1">Task Title</label>
                          <input
                            type="text"
                            required
                            value={editForm.name}
                            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                            className="w-full bg-white border border-[#CECBF6] focus:border-[#7F77DD] rounded-xl px-3.5 py-2.5 text-xs focus:outline-none text-[#26215C] font-semibold"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] uppercase tracking-wider text-[#534AB7] font-bold mb-1">Deadline target</label>
                          <input
                            type="datetime-local"
                            required
                            value={editForm.deadline}
                            onChange={(e) => setEditForm({ ...editForm, deadline: e.target.value })}
                            className="w-full bg-white border border-[#CECBF6] focus:border-[#7F77DD] rounded-xl px-3.5 py-2.5 text-xs focus:outline-none text-[#26215C] font-semibold"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] uppercase tracking-wider text-[#534AB7] font-bold mb-1">
                            Estimated effort (hours)
                          </label>
                          <input
                            type="number"
                            required
                            min="1"
                            max="100"
                            value={editForm.estimatedEffort}
                            onChange={(e) => setEditForm({ ...editForm, estimatedEffort: Number(e.target.value) })}
                            className="w-full bg-white border border-[#CECBF6] focus:border-[#7F77DD] rounded-xl px-3.5 py-2.5 text-xs focus:outline-none text-[#26215C] font-semibold"
                          />
                          <span className="text-[9px] text-[#888780] block mt-1.5 leading-tight font-semibold">
                            💡 Microsteps will auto-redistribute
                          </span>
                        </div>
                        <div>
                          <label className="block text-[10px] uppercase tracking-wider text-[#534AB7] font-bold mb-1">Priority</label>
                          <select
                            value={editForm.priority}
                            onChange={(e) => setEditForm({ ...editForm, priority: e.target.value as any })}
                            className="w-full bg-white border border-[#CECBF6] focus:border-[#7F77DD] rounded-xl px-3.5 py-2.5 text-xs focus:outline-none text-[#26215C] font-semibold"
                          >
                            <option value="low">Low priority</option>
                            <option value="medium">Medium priority</option>
                            <option value="high">High priority</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] uppercase tracking-wider text-[#534AB7] font-bold mb-1">Category</label>
                          <select
                            value={editForm.category}
                            onChange={(e) => setEditForm({ ...editForm, category: e.target.value as any })}
                            className="w-full bg-white border border-[#CECBF6] focus:border-[#7F77DD] rounded-xl px-3.5 py-2.5 text-xs focus:outline-none text-[#26215C] font-semibold"
                          >
                            <option value="study">Study</option>
                            <option value="work">Work</option>
                            <option value="personal">Personal</option>
                          </select>
                        </div>
                      </div>

                      <div className="flex justify-end gap-2 pt-2">
                        <button
                          type="button"
                          onClick={handleCancelEditTask}
                          className="px-4 py-2 rounded-xl text-xs font-bold text-[#534AB7] hover:bg-[#EEEDFE]/50 transition cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveEditTask(task)}
                          className="px-4 py-2 bg-[#7F77DD] hover:bg-[#6b62ce] text-white rounded-xl text-xs font-bold transition shadow-sm cursor-pointer"
                        >
                          Save changes
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 2. Microsteps Breakdown Display Area */}
                  {!task.completed && (
                    <div className="mt-2.5" id={`microsteps-section-${task.id}`}>
                      {hasSteps ? (
                        <div>
                          <button
                            onClick={() => toggleCardExpansion(task.id)}
                            className="flex items-center gap-1.5 text-[11px] font-bold text-[#534AB7] hover:text-[#26215C] transition cursor-pointer"
                          >
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            <span>Microsteps Plan ({completedSteps}/{totalSteps} complete)</span>
                          </button>

                          {isExpanded && (
                            <div className="mt-2.5 space-y-1.5 pl-2 border-l-2 border-[#CECBF6]/60">
                              {task.subtasks.map((sub: SubTask) => {
                                // steps distributed within user budget in minutes
                                const stepMinutes = Math.round(sub.estimatedEffort * 60);

                                return (
                                  <div 
                                    key={sub.id} 
                                    className="flex items-center justify-between py-1.5 bg-[#F5F3FF]/30 px-3 rounded-lg border border-[#CECBF6]/40"
                                  >
                                    <div className="flex items-center space-x-2.5">
                                      <button 
                                        onClick={() => handleToggleSubtask(task, sub.id)}
                                        className={`w-4 h-4 border rounded flex items-center justify-center transition shrink-0 cursor-pointer ${
                                          sub.completed 
                                            ? 'bg-[#7F77DD] border-[#7F77DD] text-white' 
                                            : 'border-[#CECBF6] hover:border-[#7F77DD] bg-white'
                                        }`}
                                      >
                                        {sub.completed && <Check className="w-3 h-3 text-white stroke-[3.5]" />}
                                      </button>
                                      <span className={`text-[11.5px] font-bold ${sub.completed ? 'line-through text-[#888780] font-medium' : 'text-[#26215C]'}`}>
                                        {sub.name}
                                      </span>
                                    </div>
                                    <span className="text-[9.5px] bg-[#EEEDFE] border border-[#CECBF6] px-1.5 py-0.5 rounded font-black text-[#534AB7] shrink-0">
                                      {stepMinutes} min
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="bg-[#F5F3FF]/40 border border-[#CECBF6]/40 p-3 rounded-lg flex items-center justify-between">
                          {decompressingTasks[task.id] === 'failed' ? (
                            <>
                              <span className="text-[10px] text-rose-500 font-semibold flex items-center gap-1">
                                <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                                Breakdown failed
                              </span>
                              <button 
                                onClick={() => handleDecompressTask(task)}
                                className="flex items-center gap-1 text-[10px] font-bold text-white bg-rose-500 hover:bg-rose-600 px-2 py-0.5 rounded-lg cursor-pointer"
                              >
                                Retry
                              </button>
                            </>
                          ) : (
                            <span className="text-[10px] text-[#7F77DD] italic font-bold flex items-center gap-1.5 animate-pulse">
                              <Brain className="w-3.5 h-3.5 text-[#7F77DD] animate-spin" />
                              ✨ Breaking into steps...
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Complete Entire Task Button */}
                  {!task.completed && (
                    <button
                      onClick={() => handleToggleTaskCompleted(task)}
                      className="w-full mt-3 py-2 px-4 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition cursor-pointer hover:shadow-xs"
                    >
                      <Check className="w-4 h-4 text-emerald-600 stroke-[3.5]" />
                      <span>Complete Entire Task</span>
                    </button>
                  )}

                  {/* 3. Footer row ("What if I miss this?" left, "Draft extension" right) */}
                  {!task.completed && (
                    <div className="flex items-center justify-between border-t border-[#CECBF6]/40 pt-3 text-[11px] font-bold text-[#534AB7]">
                      <button 
                        onClick={() => handleToggleConsequences(task)}
                        className="hover:text-[#26215C] flex items-center gap-1 cursor-pointer transition text-amber-700 hover:text-amber-950"
                      >
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>What if I miss this?</span>
                        {loadingConsequences[task.id] && (
                          <span className="text-[9px] text-amber-500 animate-pulse font-normal">(Consulting Coach...)</span>
                        )}
                      </button>

                      <button 
                        onClick={() => requestExtensionDraft(task)}
                        className="hover:text-[#26215C] flex items-center gap-1.2 cursor-pointer transition text-[#7F77DD]"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>Draft Extension</span>
                      </button>
                    </div>
                  )}

                </div>

                {/* 4. Consequence Banner at very bottom of card (coral strip, full width) */}
                {!task.completed && task.consequences && (
                  <div className="bg-[#FAECE7] border-t border-[#F09595] text-[11.5px] text-[#993C1D] px-4 py-2.5 flex items-start gap-2 font-bold select-none shrink-0">
                    <AlertTriangle className="w-4 h-4 text-[#993C1D] shrink-0 mt-0.5" />
                    <span>Consequence: {task.consequences}</span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Collapsible Completed Section */}
      {completedFilteredTasks.length > 0 && (
        <div className="mt-6 pt-5 border-t border-[#CECBF6]/40" id="completed-tasks-collapsible-wrapper">
          <button
            type="button"
            onClick={() => setIsCompletedSectionOpen(!isCompletedSectionOpen)}
            className="flex items-center justify-between w-full py-2.5 px-4 bg-[#EEEDFE]/40 hover:bg-[#EEEDFE]/80 border border-[#CECBF6] rounded-xl text-xs font-bold text-[#534AB7] transition cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-500 stroke-[3]" />
              <span>Completed Targets ({completedFilteredTasks.length})</span>
            </div>
            {isCompletedSectionOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {isCompletedSectionOpen && (
            <div className="mt-3.5 space-y-3 animate-fade-in" id="completed-tasks-list">
              {completedFilteredTasks.map((task) => (
                <div 
                  key={task.id}
                  className="border border-[#CECBF6] rounded-xl bg-gray-50/50 p-4 relative flex flex-col gap-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5 flex-1 min-w-0">
                      <button
                        onClick={() => handleToggleTaskCompleted(task)}
                        className="w-5.5 h-5.5 border rounded-lg flex items-center justify-center transition shrink-0 mt-0.5 cursor-pointer bg-emerald-500 border-emerald-500 text-white shadow-sm"
                        id={`completed-task-check-${task.id}`}
                      >
                        <Check className="w-3.5 h-3.5 text-white stroke-[3.5]" />
                      </button>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-extrabold truncate line-through text-[#888780] block">
                          {task.name}
                        </span>
                        <span className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider block mt-0.5">
                          Completed ✓
                        </span>
                      </div>
                    </div>
                    <button 
                      onClick={() => handleDeleteTask(task.id)}
                      className="p-1.5 rounded-lg border border-transparent hover:border-[#CECBF6] text-[#888780] hover:text-rose-500 hover:bg-rose-50 transition cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
