import React, { useState, useEffect, useRef } from 'react';
import { 
  Sparkles, Clock, Calendar, CheckCircle2, AlertTriangle, 
  MessageSquare, Plus, Trash2, Send, CornerDownRight, 
  Check, Copy, RefreshCw, Flame, ListFilter, Brain, 
  AlertOctagon, ArrowUpRight, CheckSquare, X, ChevronDown, ChevronUp, FileText,
  Mic, MicOff, Timer, Activity, Pencil, LogIn, LogOut, Award, CheckSquare2, CalendarDays, PlusSquare, CalendarRange
} from 'lucide-react';
import { collection, doc, query, onSnapshot, writeBatch, deleteDoc, updateDoc, setDoc } from 'firebase/firestore';
import { db, initAuth, googleSignIn, logout, getAccessToken } from './firebase';
import { User } from 'firebase/auth';
import { StatCards } from './components/StatCards';
import { AutopilotCard } from './components/AutopilotCard';
import { TaskBoard } from './components/TaskBoard';
import { CoachSidebar } from './components/CoachSidebar';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: null,
      email: null,
      emailVerified: null,
      isAnonymous: null,
      tenantId: null,
      providerInfo: []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export interface SubTask {
  id: string;
  name: string;
  estimatedEffort: number;
  completed: boolean;
}

export interface Task {
  id: string;
  name: string;
  deadline: string; // ISO String (Date only or Date + Time)
  estimatedEffort: number;
  priority: 'high' | 'medium' | 'low';
  category: 'study' | 'work' | 'personal' | 'finance';
  completed: boolean;
  subtasks: SubTask[];
  createdAt: string;
  consequences?: string;
  dailyHoursAvailable?: number;
  availableDays?: string[];
  totalHours?: number;
}

export interface Message {
  id: string;
  role: 'user' | 'model';
  content: string;
  createdAt: string;
}

export interface AutopilotAllocation {
  taskId: string;
  taskName: string;
  allocatedHours: number;
  timeSlots?: string[];
}

export interface AutopilotDay {
  date: string;
  tasks: AutopilotAllocation[];
}

export interface EmailDraft {
  subject: string;
  to: string;
  body: string;
}

export interface Goal {
  id: string;
  title: string;
  target: number;
  current: number;
  type: 'daily' | 'weekly';
  completed: boolean;
  createdAt: string;
}


export default function App() {
  // Real-time Cloud Firestore & Persistent Local User Sync
  const [userId, setUserId] = useState<string>('');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Tab Control State
  const [activeTab, setActiveTab] = useState<'autopilot' | 'goals' | 'insights' | 'integrations'>('autopilot');

  // Google Calendar Integration states
  const [gcalUser, setGcalUser] = useState<User | null>(null);
  const [gcalToken, setGcalToken] = useState<string | null>(null);
  const [calendarEvents, setCalendarEvents] = useState<any[]>([]);
  const [isFetchingCalendar, setIsFetchingCalendar] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);

  // Goals & Habits states
  const [goals, setGoals] = useState<Goal[]>([]);
  const [streakCount, setStreakCount] = useState<number>(3);
  const [isAddingGoal, setIsAddingGoal] = useState(false);
  const [newGoalTitle, setNewGoalTitle] = useState('');
  const [newGoalTarget, setNewGoalTarget] = useState(3);
  const [newGoalType, setNewGoalType] = useState<'daily' | 'weekly'>('daily');
  const [dailyHabits, setDailyHabits] = useState<{ id: string; name: string; completed: boolean }[]>([
    { id: 'h1', name: 'Morning Schedule Check 🌅', completed: false },
    { id: 'h2', name: 'Work / Study for 2+ Hours 📚', completed: false },
    { id: 'h3', name: 'Complete At Least 1 Goal 🏆', completed: false },
    { id: 'h4', name: 'Discuss with Coach LifeSaver 💬', completed: false }
  ]);

  // AI Productivity Coach states
  const [coachingReview, setCoachingReview] = useState<string>('');
  const [isCoachingReviewLoading, setIsCoachingReviewLoading] = useState(false);
  
  // App UI States
  const [inputMessage, setInputMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>('all');
  const [activePriorityFilter, setActivePriorityFilter] = useState<string>('all');
  const [expandedTasks, setExpandedTasks] = useState<Record<string, boolean>>({});
  const [decompressingTasks, setDecompressingTasks] = useState<Record<string, 'loading' | 'failed' | 'idle'>>({});
  const [showRescheduleBanner, setShowRescheduleBanner] = useState(false);

  
  // Autopilot autopilot state
  const [pressureScore, setPressureScore] = useState<number>(5);
  const [pressureExplanation, setPressureExplanation] = useState<string>(
    'Let’s feed some tasks into Autopilot to gauge your danger zones.'
  );
  const [procrastinationNudge, setProcrastinationNudge] = useState<string>('');
  const [autopilotSchedule, setAutopilotSchedule] = useState<AutopilotDay[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [emailDraft, setEmailDraft] = useState<EmailDraft | null>(null);
  
  // Quick adds & Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newTaskStep, setNewTaskStep] = useState(1);
  const [newTask, setNewTask] = useState({
    name: '',
    deadlineDate: '',
    deadlineTime: '18:00',
    estimatedEffort: 1,
    priority: 'medium' as 'high' | 'medium' | 'low',
    category: 'study' as 'study' | 'work' | 'personal' | 'finance',
    dailyHoursAvailable: 4,
    availableDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  });

  // Dynamically set tomorrow's date on mount
  useEffect(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const yr = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const dy = String(d.getDate()).padStart(2, '0');
    setNewTask(prev => ({ ...prev, deadlineDate: `${yr}-${mo}-${dy}` }));
  }, []);
  const [draftModificationTone, setDraftModificationTone] = useState<'professional' | 'apologetic' | 'negotiating'>('professional');
  const [isEditingDraft, setIsEditingDraft] = useState(false);

  // 2. Functional Voice Dump States
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [voiceExtractedTasks, setVoiceExtractedTasks] = useState<any[]>([]);
  const [showVoicePreviewModal, setShowVoicePreviewModal] = useState(false);
  const recognitionRef = useRef<any>(null);

  // 3. Panic Button (2-Hour Triage Plan) States
  const [showPanicOverlay, setShowPanicOverlay] = useState(false);
  const [isPanicLoading, setIsPanicLoading] = useState(false);
  const [panicPlan, setPanicPlan] = useState<{ targetTask: string; steps: string[]; postpone: string[] } | null>(null);
  const [panicTimeLeft, setPanicTimeLeft] = useState(7200); // 2 hours in seconds
  const [isFocusModeLocked, setIsFocusModeLocked] = useState(false);
  const [panicIntervalId, setPanicIntervalId] = useState<any>(null);

  // 4. Consequence Awareness States
  const [expandedConsequences, setExpandedConsequences] = useState<Record<string, boolean>>({});
  const [loadingConsequences, setLoadingConsequences] = useState<Record<string, boolean>>({});

  // 5. Better Onboarding States
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(1);
  const [onboardingTaskName, setOnboardingTaskName] = useState('');
  const [onboardingDeadline, setOnboardingDeadline] = useState('2026-06-25T18:00');
  const [onboardingFreeHours, setOnboardingFreeHours] = useState(4);
  const [onboardingWorkStyle, setOnboardingWorkStyle] = useState<'bursts' | 'structure' | 'grind'>(
    () => (localStorage.getItem('lifesaver_workstyle') as 'bursts' | 'structure' | 'grind') || 'bursts'
  );
  const [isOnboardingSubmitting, setIsOnboardingSubmitting] = useState(false);

  // 6. Intelligent Task Validation UI States
  const [validationState, setValidationState] = useState<{
    type: 'idle' | 'loading' | 'spelling' | 'vague' | 'meaningless';
    originalName: string;
    correctedName?: string;
    suggestedQuestion?: string;
    vagueResponse?: string;
  }>({ type: 'idle', originalName: '' });

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Task Editing & Autopilot Loading States
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    name: string;
    deadline: string;
    estimatedEffort: number;
    priority: 'high' | 'medium' | 'low';
    category: 'study' | 'work' | 'personal' | 'finance';
  } | null>(null);
  const [taskToasts, setTaskToasts] = useState<Record<string, string>>({});
  const [isAutopilotRecalculating, setIsAutopilotRecalculating] = useState(false);

  // Strict Real-Time and Completed Task States
  const [taskCreationError, setTaskCreationError] = useState<string | null>(null);
  const [confirmCompleteTask, setConfirmCompleteTask] = useState<Task | null>(null);
  const [confirmUndoTask, setConfirmUndoTask] = useState<Task | null>(null);
  const [showSuccessCelebration, setShowSuccessCelebration] = useState<{ taskName: string; message: string } | null>(null);

  // Initialize unique user ID and Google Auth
  useEffect(() => {
    const unsubscribeAuth = initAuth(
      async (user, token) => {
        setGcalUser(user);
        setGcalToken(token);
        setUserId(user.uid);
        localStorage.setItem('lifesaver_userid', user.uid);
        loadCalendarEvents(token);
      },
      () => {
        setGcalUser(null);
        setGcalToken(null);
        let storedId = localStorage.getItem('lifesaver_userid');
        if (!storedId) {
          storedId = 'user_ls_' + Math.random().toString(36).substring(2, 11);
          localStorage.setItem('lifesaver_userid', storedId);
        }
        setUserId(storedId);
      }
    );

    const savedStreak = localStorage.getItem('lifesaver_streak');
    if (savedStreak) {
      setStreakCount(parseInt(savedStreak, 10));
    } else {
      setStreakCount(5);
    }

    const savedHabits = localStorage.getItem('lifesaver_habits');
    if (savedHabits) {
      try { setDailyHabits(JSON.parse(savedHabits)); } catch(e) {}
    }

    return () => {
      if (typeof unsubscribeAuth === 'function') {
        unsubscribeAuth();
      }
    };
  }, []);

  const handleExportScheduleToCalendar = async () => {
    if (!gcalToken) {
      alert("Please connect your Google Calendar in the Integrations tab first!");
      return;
    }
    
    const confirmed = window.confirm(`Export Autopilot Schedule to Google Calendar? This will add your scheduled tasks for the next 7 days as calendar events.`);
    if (!confirmed) return;

    setIsSending(true);
    let successCount = 0;
    try {
      for (const day of autopilotSchedule) {
        for (const alloc of day.tasks) {
          const summary = `🚀 [LifeSaver Autopilot] ${alloc.taskName}`;
          const description = `Scheduled focus block: ${alloc.allocatedHours} hours allocated by LifeSaver AI coach.`;
          
          const startDateTime = `${day.date}T09:00:00`;
          const endDateTime = `${day.date}T${(9 + alloc.allocatedHours).toString().padStart(2, '0')}:00:00`;
          
          const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events`;
          await fetch(url, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${gcalToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              summary,
              description,
              start: { dateTime: startDateTime, timeZone: 'UTC' },
              end: { dateTime: endDateTime, timeZone: 'UTC' }
            })
          });
          successCount++;
        }
      }
      alert(`Successfully exported ${successCount} scheduling blocks to your Google Calendar!`);
    } catch (e) {
      console.error(e);
      alert("Failed to export schedule to calendar. Please verify permissions.");
    } finally {
      setIsSending(false);
    }
  };

  const loadCalendarEvents = async (token: string) => {
    setIsFetchingCalendar(true);
    setCalendarError(null);
    try {
      const timeMin = new Date().toISOString();
      const timeMax = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const items = (data.items || []).map((evt: any) => ({
          id: evt.id,
          summary: evt.summary || 'Busy block',
          start: evt.start?.dateTime || evt.start?.date || '',
          end: evt.end?.dateTime || evt.end?.date || ''
        }));
        setCalendarEvents(items);
      } else {
        setCalendarError("Failed to import calendar events — token might be expired.");
      }
    } catch (e) {
      setCalendarError("Could not retrieve Google Calendar data.");
    } finally {
      setIsFetchingCalendar(false);
    }
  };

  const handleGcalConnect = async () => {
    try {
      setIsSending(true);
      const res = await googleSignIn();
      if (res) {
        setGcalUser(res.user);
        setGcalToken(res.accessToken);
        setUserId(res.user.uid);
        localStorage.setItem('lifesaver_userid', res.user.uid);
        await loadCalendarEvents(res.accessToken);
        // Alert briefly as required, wait we don't have window restrictions for basic alert or we can show modal
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSending(false);
    }
  };

  const handleGcalDisconnect = async () => {
    if (!window.confirm("Are you sure you want to disconnect Google Calendar?")) return;
    await logout();
    setGcalUser(null);
    setGcalToken(null);
    setCalendarEvents([]);
  };

  // Listen to Firestore Goals
  useEffect(() => {
    if (!userId) return;

    const goalsCol = collection(db, 'users', userId, 'goals');
    const unsubscribeGoals = onSnapshot(goalsCol, (snapshot) => {
      const goalList: Goal[] = [];
      snapshot.forEach((doc) => {
        goalList.push({ id: doc.id, ...doc.data() } as Goal);
      });
      
      if (goalList.length === 0) {
        const seedGoals = [
          { id: 'g_1', title: 'Complete 2 tasks daily 🎯', target: 2, current: 0, type: 'daily', completed: false, createdAt: new Date().toISOString() },
          { id: 'g_2', title: 'Achieve 10 total focus hours weekly ⚡', target: 10, current: 0, type: 'weekly', completed: false, createdAt: new Date().toISOString() }
        ];
        seedGoals.forEach(g => {
          setDoc(doc(db, 'users', userId, 'goals', g.id), g).catch(() => {});
        });
        setGoals(seedGoals);
      } else {
        setGoals(goalList);
      }
    });

    return () => {
      unsubscribeGoals();
    };
  }, [userId]);

  const handleCreateGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGoalTitle.trim() || !userId) return;

    const goalId = 'goal_' + Math.random().toString(36).substring(2, 9);
    const goalData: Goal = {
      id: goalId,
      title: newGoalTitle,
      target: Number(newGoalTarget) || 1,
      current: 0,
      type: newGoalType,
      completed: false,
      createdAt: new Date().toISOString()
    };

    try {
      await setDoc(doc(db, 'users', userId, 'goals', goalId), goalData);
      setNewGoalTitle('');
      setIsAddingGoal(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleHabit = (id: string) => {
    const updated = dailyHabits.map(h => {
      if (h.id === id) {
        const nextState = !h.completed;
        if (nextState) {
          // Increment streak count on positive action
          const nextStreak = streakCount + 1;
          setStreakCount(nextStreak);
          localStorage.setItem('lifesaver_streak', String(nextStreak));
        }
        return { ...h, completed: nextState };
      }
      return h;
    });
    setDailyHabits(updated);
    localStorage.setItem('lifesaver_habits', JSON.stringify(updated));
  };

  // Listen to Firestore Tasks
  useEffect(() => {
    if (!userId) return;

    const tasksCol = collection(db, 'users', userId, 'tasks');
    const unsubscribeTasks = onSnapshot(tasksCol, (snapshot) => {
      const taskList: Task[] = [];
      snapshot.forEach((doc) => {
        taskList.push({ id: doc.id, ...doc.data() } as Task);
      });
      // Sort tasks by deadline
      taskList.sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime());
      setTasks(taskList);
      setIsLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `users/${userId}/tasks`);
    });


    const chatsCol = collection(db, 'users', userId, 'chats');
    const unsubscribeChats = onSnapshot(chatsCol, (snapshot) => {
      const chatList: Message[] = [];
      snapshot.forEach((doc) => {
        chatList.push({ id: doc.id, ...doc.data() } as Message);
      });
      // Sort chats by createdAt
      chatList.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      
      // If no messages exist, trigger onboarding message
      if (chatList.length === 0) {
        setMessages([
          {
            id: 'onboarding',
            role: 'model',
            content: "What's on your plate right now? Drop everything — deadlines, tasks, worries — and I'll help you sort it out. Give me a raw brain dump if you want, and watch how fast we set up a stress-busting roadmap.",
            createdAt: new Date().toISOString()
          }
        ]);
      } else {
        setMessages(chatList);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `users/${userId}/chats`);
    });

    return () => {
      unsubscribeTasks();
      unsubscribeChats();
    };
  }, [userId]);

  // 2. Speech Recognition Initialization
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = 'en-US';
      
      rec.onstart = () => {
        setIsRecordingVoice(true);
        setVoiceTranscript('');
      };
      
      rec.onresult = async (event: any) => {
        const transcript = event.results[0][0].transcript;
        setVoiceTranscript(transcript);
        await processVoiceTranscript(transcript);
      };
      
      rec.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsRecordingVoice(false);
        if (event.error === 'not-allowed') {
          const fallbackText = prompt("Microphone access is blocked in this frame. Please paste or type your voice note here:");
          if (fallbackText) {
            processVoiceTranscript(fallbackText);
          }
        }
      };
      
      rec.onend = () => {
        setIsRecordingVoice(false);
      };
      
      recognitionRef.current = rec;
    }
  }, []);

  // 5. Onboarding Trigger Effect
  useEffect(() => {
    if (!isLoading && userId) {
      const onboarded = localStorage.getItem('lifesaver_onboarded');
      if (!onboarded && tasks.length === 0) {
        setShowOnboarding(true);
      }
    }
  }, [isLoading, userId, tasks.length]);

  // Read latest calendar and autopilot data from local session (or backup calculation)
  useEffect(() => {
    if (tasks.length > 0) {
      // Periodic automatic recalculation on initial load if schedule is empty
      if (autopilotSchedule.length === 0 && !isSending) {
        recalculateSchedule();
      }
    }
  }, [tasks]);

  // Scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Autonomous Rescheduling Detector
  useEffect(() => {
    if (isLoading || isSending) return;
    if (autopilotSchedule.length === 0) return;

    // Check if any day exceeds the safe hours limit of 8 hours
    const hasOverloadedDay = autopilotSchedule.some(day => {
      const dayTotal = day.tasks.reduce((sum, t) => sum + t.allocatedHours, 0);
      return dayTotal > 8;
    });

    if (hasOverloadedDay && !showRescheduleBanner) {
      console.log("Autonomous Rescheduling Triggered! Danger Zone overload detected (day exceeds 8h).");
      triggerAutonomousReschedule();
    }
  }, [autopilotSchedule, tasks, isLoading, isSending]);

  const triggerAutonomousReschedule = async () => {
    try {
      setIsSending(true);
      const userDate = getTodayDateString();
      
      // Compute the next 7 days date range
      const dateRange: string[] = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(userDate);
        d.setDate(d.getDate() + i);
        dateRange.push(d.toISOString().split('T')[0]);
      }

      const response = await fetch('/api/reschedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentTasks: tasks.filter(t => !t.completed),
          dateRange,
          workStyle: onboardingWorkStyle
        })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.autopilotSchedule) {
          setAutopilotSchedule(data.autopilotSchedule);
          setShowRescheduleBanner(true);

          // Add Coach rescheduled warning log to AI Chat messages
          const coachMsg: Message = {
            id: 'msg_coach_' + Date.now(),
            role: 'model',
            content: data.coachLogMessage || "Coach: I detected schedule conflicts exceeding the 8h daily limit and redistributed your tasks across the remaining available days. Take a breath, your stress levels have been rebalanced!",
            createdAt: new Date().toISOString()
          };

          setMessages(prev => [...prev, coachMsg]);
          if (userId) {
            try {
              await setDoc(doc(db, 'users', userId, 'chats', coachMsg.id), {
                role: coachMsg.role,
                content: coachMsg.content,
                createdAt: coachMsg.createdAt
              });
            } catch (error) {
              handleFirestoreError(error, OperationType.WRITE, `users/${userId}/chats/${coachMsg.id}`);
            }
          }
        }
      }
    } catch (err) {
      console.error("Coach autonomous rescheduling execution failed:", err);
    } finally {
      setIsSending(false);
    }
  };

  const startVoiceRecording = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.start();
      } catch (err) {
        console.error("Failed to start SpeechRecognition", err);
      }
    } else {
      const fallbackText = prompt("Speech recognition is not supported or active in this browser frame. Please type or paste your voice note directly here:");
      if (fallbackText) {
        processVoiceTranscript(fallbackText);
      }
    }
  };

  const stopVoiceRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsRecordingVoice(false);
    }
  };

  const handleVoiceDump = () => {
    setShowRescheduleBanner(false);
    if (isRecordingVoice) {
      stopVoiceRecording();
    } else {
      startVoiceRecording();
    }
  };

  const processVoiceTranscript = async (transcript: string) => {
    setIsProcessingVoice(true);
    setVoiceTranscript(transcript);
    try {
      const response = await fetch('/api/voice-dump', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript })
      });

      if (response.ok) {
        const data = await response.json();
        setVoiceExtractedTasks(data);
        setShowVoicePreviewModal(true);
      } else {
        alert('Could not extract tasks from voice note. Please try again.');
      }
    } catch (error) {
      console.error('Error processing voice note:', error);
      alert('Error communicating with Coach AI.');
    } finally {
      setIsProcessingVoice(false);
    }
  };

  const confirmAddVoiceTasks = async () => {
    if (!userId || voiceExtractedTasks.length === 0) return;

    try {
      const batch = writeBatch(db);
      voiceExtractedTasks.forEach((t: any) => {
        const taskDoc = doc(collection(db, 'users', userId, 'tasks'));
        let deadlineVal = t.deadline;
        if (!deadlineVal || isNaN(Date.parse(deadlineVal))) {
          deadlineVal = '2026-06-25T18:00';
        } else {
          if (deadlineVal.length === 10) {
            deadlineVal = `${deadlineVal}T18:00`;
          }
        }
        batch.set(taskDoc, {
          id: taskDoc.id,
          name: t.taskName || 'Unnamed Task',
          deadline: deadlineVal,
          estimatedEffort: Number(t.estimatedHours || 2),
          priority: t.priority || 'medium',
          category: t.category || 'work',
          completed: false,
          subtasks: [],
          createdAt: new Date().toISOString()
        });
      });

      await batch.commit();
      setShowVoicePreviewModal(false);
      setVoiceExtractedTasks([]);
      recalculateSchedule();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${userId}/tasks`);
    }
  };

  const handlePanicMode = async (specificTask?: Task) => {
    setShowRescheduleBanner(false);
    setIsPanicLoading(true);
    try {
      const activeTasks = tasks.filter(t => !t.completed);
      
      let hoursUntilDeadline = 24;
      const targetTask = specificTask || activeTasks[0];
      if (targetTask) {
        const nearestTime = new Date(targetTask.deadline).getTime();
        const currentTime = new Date().getTime();
        const diffMs = nearestTime - currentTime;
        hoursUntilDeadline = Math.max(1, Math.round(diffMs / (1000 * 60 * 60)));
      }

      const response = await fetch('/api/panic-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hoursUntilDeadline,
          tasks: activeTasks.map(t => ({
            name: t.name,
            category: t.category,
            priority: t.priority,
            estimatedEffort: t.estimatedEffort,
            deadline: t.deadline
          }))
        })
      });

      if (response.ok) {
        const data = await response.json();
        setPanicPlan(data);
        setShowPanicOverlay(true);
        setPanicTimeLeft(7200); // 2 hours
        
        if (panicIntervalId) clearInterval(panicIntervalId);
        const interval = setInterval(() => {
          setPanicTimeLeft(prev => {
            if (prev <= 1) {
              clearInterval(interval);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
        setPanicIntervalId(interval);
      } else {
        alert('Coach could not generate a panic plan. Try organizing your tasks first.');
      }
    } catch (err) {
      console.error('Error generating panic plan:', err);
      alert('Failed to initialize emergency triage session.');
    } finally {
      setIsPanicLoading(false);
    }
  };

  const handleToggleConsequences = async (task: Task) => {
    const isExpanded = !!expandedConsequences[task.id];
    
    if (task.consequences) {
      setExpandedConsequences(prev => ({ ...prev, [task.id]: !isExpanded }));
      return;
    }

    setLoadingConsequences(prev => ({ ...prev, [task.id]: true }));
    try {
      const response = await fetch('/api/consequences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskName: task.name,
          category: task.category,
          priority: task.priority,
          deadline: task.deadline
        })
      });

      if (response.ok) {
        const data = await response.json();
        const consequencesText = data.consequences || 'Missing this task might delay your dependent goals.';
        
        if (userId) {
          await updateDoc(doc(db, 'users', userId, 'tasks', task.id), {
            consequences: consequencesText
          });
        }
        
        setExpandedConsequences(prev => ({ ...prev, [task.id]: true }));
      }
    } catch (err) {
      console.error('Error generating consequences:', err);
    } finally {
      setLoadingConsequences(prev => ({ ...prev, [task.id]: false }));
    }
  };

  const handleCompleteOnboarding = async () => {
    if (!onboardingTaskName.trim()) {
      alert("Please enter your biggest deadline task name to continue.");
      return;
    }
    setIsOnboardingSubmitting(true);
    try {
      const taskDoc = doc(collection(db, 'users', userId, 'tasks'));
      let deadlineVal = onboardingDeadline;
      if (!deadlineVal) {
        deadlineVal = '2026-06-25T18:00';
      }
      const initialTask: Task = {
        id: taskDoc.id,
        name: onboardingTaskName,
        deadline: deadlineVal,
        estimatedEffort: 3,
        priority: 'high',
        category: 'study',
        completed: false,
        subtasks: [],
        createdAt: new Date().toISOString()
      };
      await setDoc(taskDoc, initialTask);

      const response = await fetch('/api/onboarding-welcome', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workStyle: onboardingWorkStyle,
          taskName: onboardingTaskName,
          deadline: deadlineVal
        })
      });

      let welcomeContent = `Welcome to LifeSaver AI! I see you work in ${onboardingWorkStyle} style and have a big deadline '${onboardingTaskName}' ahead. Let's tackle it step-by-step together.`;
      if (response.ok) {
        const data = await response.json();
        welcomeContent = data.message || welcomeContent;
      }

      const welcomeDoc = doc(collection(db, 'users', userId, 'chats'));
      await setDoc(welcomeDoc, {
        id: welcomeDoc.id,
        role: 'model',
        content: welcomeContent,
        createdAt: new Date().toISOString()
      });

      localStorage.setItem('lifesaver_onboarded', 'true');
      localStorage.setItem('lifesaver_capacity', String(onboardingFreeHours));
      localStorage.setItem('lifesaver_workstyle', onboardingWorkStyle);
      
      setShowOnboarding(false);
      recalculateSchedule();
    } catch (err) {
      console.error('Error in complete onboarding:', err);
    } finally {
      setIsOnboardingSubmitting(false);
    }
  };

  // Recalculate stress metric & structured days by calling the AI API
  const recalculateSchedule = async (specifiedPrompt?: string, customTasks?: Task[]) => {
    try {
      setIsSending(true);
      setIsAutopilotRecalculating(true);
      const userDate = getTodayDateString(); // Current system date
      
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            {
              role: 'user',
              content: specifiedPrompt || 'Analyze current task loads, optimize schedule autopilot, and calculate pressure scores.'
            }
          ],
          currentTasks: customTasks || tasks,
          currentDateTime: userDate,
          currentCalendarEvents: calendarEvents,
          goals: goals,
          streakCount: streakCount,
          workStyle: onboardingWorkStyle
        })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.pressureScore !== undefined) setPressureScore(data.pressureScore);
        if (data.pressureExplanation) setPressureExplanation(data.pressureExplanation);
        if (data.procrastinationNudge) setProcrastinationNudge(data.procrastinationNudge);
        if (data.autopilotSchedule) setAutopilotSchedule(data.autopilotSchedule);
        if (data.warnings) setWarnings(data.warnings);
        if (data.emailDraft) setEmailDraft(data.emailDraft);
        return data;
      }
    } catch (e) {
      console.error('Failed to auto restructure schedule', e);
    } finally {
      setIsSending(false);
      setIsAutopilotRecalculating(false);
    }
    return null;
  };

  // Check custom text for voice dump or raw inputs
  const handleSendMessage = async (customText?: string) => {
    const textToSend = customText || inputMessage;
    if (!textToSend.trim()) return;

    if (!customText) setInputMessage('');
    setIsSending(true);

    const userMsg: Message = {
      id: 'msg_u_' + Date.now(),
      role: 'user',
      content: textToSend,
      createdAt: new Date().toISOString()
    };

    // Optimistically update lists local
    const updatedMsgs = [...messages, userMsg];
    setMessages(updatedMsgs);

    // Save user message to Firestore
    if (userId) {
      try {
        await setDoc(doc(db, 'users', userId, 'chats', userMsg.id), {
          role: userMsg.role,
          content: userMsg.content,
          createdAt: userMsg.createdAt
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `users/${userId}/chats/${userMsg.id}`);
      }
    }

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: updatedMsgs.slice(-8), // Send last 8 context items
          currentTasks: tasks,
          currentDateTime: getTodayDateString(),
          currentCalendarEvents: calendarEvents,
          goals: goals,
          streakCount: streakCount,
          workStyle: onboardingWorkStyle
        })
      });


      if (response.ok) {
        const data = await response.json();
        
        // Save model response
        const modelMsg: Message = {
          id: 'msg_m_' + Date.now(),
          role: 'model',
          content: data.reply || 'Got it! Your schedule is optimized.',
          createdAt: new Date().toISOString()
        };

        if (userId) {
          try {
            await setDoc(doc(db, 'users', userId, 'chats', modelMsg.id), {
              role: modelMsg.role,
              content: modelMsg.content,
              createdAt: modelMsg.createdAt
            });
          } catch (error) {
            handleFirestoreError(error, OperationType.WRITE, `users/${userId}/chats/${modelMsg.id}`);
          }
        }

        // Apply any parsed/extracted/updated tasks directly to Firestore
        if (data.extractedTasks && Array.isArray(data.extractedTasks)) {
          try {
            const batch = writeBatch(db);
            data.extractedTasks.forEach((extTask: any) => {
              const taskRef = doc(db, 'users', userId, 'tasks', extTask.id || 'tsk_' + Math.random().toString(36).substring(2, 9));
              batch.set(taskRef, {
                name: extTask.name,
                deadline: extTask.deadline || new Date(Date.now() + 48*60*60*1000).toISOString(),
                estimatedEffort: Number(extTask.estimatedEffort || 2),
                priority: extTask.priority || 'medium',
                category: extTask.category || 'work',
                completed: extTask.completed !== undefined ? extTask.completed : false,
                subtasks: extTask.subtasks || [],
                createdAt: new Date().toISOString()
              }, { merge: true });
            });
            await batch.commit();
          } catch (error) {
            handleFirestoreError(error, OperationType.WRITE, `users/${userId}/tasks`);
          }
        }

        // Apply metadata updates
        if (data.pressureScore !== undefined) setPressureScore(data.pressureScore);
        if (data.pressureExplanation) setPressureExplanation(data.pressureExplanation);
        if (data.procrastinationNudge !== undefined) setProcrastinationNudge(data.procrastinationNudge);
        if (data.autopilotSchedule) setAutopilotSchedule(data.autopilotSchedule);
        if (data.warnings) setWarnings(data.warnings);
        if (data.emailDraft) setEmailDraft(data.emailDraft);

      } else {
        throw new Error('Server error analyzing input');
      }
    } catch (err: any) {
      console.error(err);
      const errorMsg: Message = {
        id: 'msg_err_' + Date.now(),
        role: 'model',
        content: `Hmm, my circuits are slightly tangled up: ${err.message}. Let me try that again.`,
        createdAt: new Date().toISOString()
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsSending(false);
    }
  };

  // Decompose task by fetching subtasks
  const handleDecompressTask = async (task: Task) => {
    if (decompressingTasks[task.id] === 'loading') return;

    setDecompressingTasks(prev => ({ ...prev, [task.id]: 'loading' }));
    try {
      const response = await fetch('/api/decompress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskName: task.name,
          category: task.category,
          estimatedEffort: task.estimatedEffort
        })
      });

      if (response.ok) {
        const subtasksData = await response.json();
        // Map to standard layout with unique IDs
        const generatedSubtasks = subtasksData.map((sub: any, idx: number) => ({
          id: `sub_${task.id}_${idx}_${Date.now()}`,
          name: sub.name,
          estimatedEffort: sub.estimatedEffort || 1,
          completed: false
        }));

        const updatedTask = {
          ...task,
          subtasks: generatedSubtasks
        };

        try {
          await setDoc(doc(db, 'users', userId, 'tasks', task.id), updatedTask);
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, `users/${userId}/tasks/${task.id}`);
        }

        // Calculate actual calendar days span
        const total = Number(task.estimatedEffort) || 0.5;
        const daily = Number(task.dailyHoursAvailable) || 4;
        const daysNeeded = Math.ceil(total / daily);
        
        let daysSpan = 0;
        let workDaysAcc = 0;
        const current = new Date();
        const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const availDays = task.availableDays || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        while (workDaysAcc < daysNeeded && daysSpan < 365) {
          const dayName = weekdayNames[current.getDay()];
          if (availDays.includes(dayName)) {
            workDaysAcc++;
          }
          daysSpan++;
          current.setDate(current.getDate() + 1);
        }

        const firstMicrostep = generatedSubtasks.length > 0 ? generatedSubtasks[0].name : "initial preparations";
        const coachMessageContent = `Perfect! ${task.name} is now planned across ${daysSpan} days. Starting with ${firstMicrostep} today.`;
        
        const chatDoc = doc(collection(db, 'users', userId, 'chats'));
        await setDoc(chatDoc, {
          id: chatDoc.id,
          role: 'model',
          content: coachMessageContent,
          createdAt: new Date().toISOString()
        });

        setDecompressingTasks(prev => ({ ...prev, [task.id]: 'idle' }));
        setExpandedTasks(prev => ({ ...prev, [task.id]: true }));
        recalculateSchedule();
      } else {
        throw new Error('Failed to decompress');
      }
    } catch (e) {
      console.error('Failed to decompose task', e);
      setDecompressingTasks(prev => ({ ...prev, [task.id]: 'failed' }));
    }
  };

  // Auto-trigger decomposition for new tasks with no subtasks sequentially (concurrency throttle)
  useEffect(() => {
    if (isLoading || !userId) return;

    // Check if any task is currently decompressing/loading to prevent concurrent API spikes
    const isAnyDecompressing = Object.values(decompressingTasks).some(status => status === 'loading');
    if (isAnyDecompressing) return;

    // Find the first active task that needs decomposition and has not been attempted/failed
    const nextTaskToDecompress = tasks.find(task => {
      if (task.completed) return false;
      const hasNoSubtasks = !task.subtasks || task.subtasks.length === 0;
      const status = decompressingTasks[task.id];
      return hasNoSubtasks && !status;
    });

    if (nextTaskToDecompress) {
      handleDecompressTask(nextTaskToDecompress);
    }
  }, [tasks, isLoading, userId, decompressingTasks]);

  const getTodayDateString = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getCurrentTimeString = () => {
    const d = new Date();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  const isDeadlineInPast = () => {
    let date = newTask.deadlineDate;
    let time = newTask.deadlineTime;
    if (!date) {
      const today = new Date();
      const yr = today.getFullYear();
      const mo = String(today.getMonth() + 1).padStart(2, '0');
      const dy = String(today.getDate()).padStart(2, '0');
      date = `${yr}-${mo}-${dy}`;
      time = '17:00';
    }
    const now = new Date();
    const combined = `${date}T${time || '17:00'}`;
    const deadline = new Date(combined);
    return !isNaN(deadline.getTime()) && deadline <= now;
  };

  const calculateAvailableHoursBeforeDeadline = () => {
    if (!newTask.deadlineDate) return 0;
    const now = new Date();
    const deadlineStr = `${newTask.deadlineDate}T${newTask.deadlineTime || '12:00'}`;
    const deadline = new Date(deadlineStr);
    if (isNaN(deadline.getTime()) || deadline <= now) return 0;

    const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    let totalAvailable = 0;
    const current = new Date(now.getTime());

    while (current.toDateString() !== deadline.toDateString()) {
      const dayName = weekdayNames[current.getDay()];
      if (newTask.availableDays.includes(dayName)) {
        if (current.toDateString() === now.toDateString()) {
          const currentHour = now.getHours();
          const remainingWorkFraction = Math.max(0, Math.min(1, (20 - currentHour) / 12));
          totalAvailable += (newTask.dailyHoursAvailable || 4) * remainingWorkFraction;
        } else {
          totalAvailable += (newTask.dailyHoursAvailable || 4);
        }
      }
      current.setDate(current.getDate() + 1);
    }

    const deadlineDayName = weekdayNames[deadline.getDay()];
    if (newTask.availableDays.includes(deadlineDayName)) {
      const deadlineHour = deadline.getHours() + deadline.getMinutes() / 60;
      const fraction = Math.max(0, Math.min(1, (deadlineHour - 8) / 12));
      totalAvailable += (newTask.dailyHoursAvailable || 4) * fraction;
    }

    return parseFloat(totalAvailable.toFixed(1));
  };

  // Toggle Single Subtask completion
  const handleToggleSubtask = async (task: Task, subtaskId: string) => {
    try {
      const updatedSubtasks = task.subtasks.map(sub => {
        if (sub.id === subtaskId) {
          return { ...sub, completed: !sub.completed };
        }
        return sub;
      });

      const isAllCompleted = updatedSubtasks.every(sub => sub.completed);
      const parentTaskWillComplete = isAllCompleted && task.subtasks.length > 0;

      if (parentTaskWillComplete && !task.completed) {
        // Automatically mark parent task completed without requiring confirmation (smooth progress sync)
        const mockTaskWithNewSubtasks = { ...task, subtasks: updatedSubtasks };
        await executeToggleTaskCompleted(mockTaskWithNewSubtasks, true, true);
      } else if (!parentTaskWillComplete && task.completed) {
        // If it was completed, and we uncheck a subtask, automatically mark parent task active again!
        const mockTaskWithNewSubtasks = { ...task, subtasks: updatedSubtasks };
        // Skip confirmation here to keep the flow super fast and fluid
        await executeToggleTaskCompleted(mockTaskWithNewSubtasks, false, false);
      } else {
        // standard subtask update without transitioning parent status
        const taskRef = doc(db, 'users', userId, 'tasks', task.id);
        await updateDoc(taskRef, {
          subtasks: updatedSubtasks
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${userId}/tasks/${task.id}`);
    }
  };

  // Handle task completion toggle interceptor
  const handleToggleTaskCompleted = async (task: Task) => {
    if (!task.completed) {
      // Complete entire task -> needs confirmation
      setConfirmCompleteTask(task);
    } else {
      // Mark as incomplete -> needs undo option/confirmation
      setConfirmUndoTask(task);
    }
  };

  // Unified status transition executor
  const executeToggleTaskCompleted = async (task: Task, targetCompleted: boolean, completeAllSubtasks: boolean) => {
    try {
      const taskRef = doc(db, 'users', userId, 'tasks', task.id);
      
      let updatedSubtasks = task.subtasks;
      if (targetCompleted && completeAllSubtasks) {
        updatedSubtasks = task.subtasks.map(sub => ({ ...sub, completed: true }));
      } else if (!targetCompleted && completeAllSubtasks) {
        updatedSubtasks = task.subtasks.map(sub => ({ ...sub, completed: false }));
      }

      const originalEffort = task.totalHours || task.estimatedEffort || 1;
      const nextEffort = targetCompleted ? 0 : originalEffort;

      await updateDoc(taskRef, {
        completed: targetCompleted,
        subtasks: updatedSubtasks,
        estimatedEffort: nextEffort,
        totalHours: originalEffort
      });

      if (targetCompleted) {
        const nextStreak = streakCount + 1;
        setStreakCount(nextStreak);
        localStorage.setItem('lifesaver_streak', String(nextStreak));

        const updatedGoals = goals.map(g => {
          if (!g.completed) {
            const nextCurrent = g.current + 1;
            const completed = nextCurrent >= g.target;
            updateDoc(doc(db, 'users', userId, 'goals', g.id), {
              current: nextCurrent,
              completed
            }).catch(() => {});
            return { ...g, current: nextCurrent, completed };
          }
          return g;
        });
        setGoals(updatedGoals);

        // Success animation trigger
        setShowSuccessCelebration({
          taskName: task.name,
          message: "Great job! You've completed this goal."
        });
      }

      const updatedTasks = tasks.map(t => t.id === task.id ? { 
        ...t, 
        completed: targetCompleted, 
        subtasks: updatedSubtasks, 
        estimatedEffort: nextEffort,
        totalHours: originalEffort
      } : t);

      const data = await recalculateSchedule(undefined, updatedTasks);

      if (targetCompleted) {
        const nextIncompleteTask = updatedTasks.find(t => !t.completed);
        const newScore = data && data.pressureScore !== undefined ? data.pressureScore : Math.max(0, pressureScore - 1);
        
        let coachMsg = `Nice work finishing ${task.name}! Pressure dropped to ${newScore}/10. `;
        if (nextIncompleteTask) {
          coachMsg += `"${nextIncompleteTask.name}" is up next.`;
        } else {
          coachMsg += `No more tasks left for now!`;
        }

        const welcomeDoc = doc(collection(db, 'users', userId, 'chats'));
        await setDoc(welcomeDoc, {
          id: welcomeDoc.id,
          role: 'model',
          content: coachMsg,
          createdAt: new Date().toISOString()
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${userId}/tasks/${task.id}`);
    } finally {
      setConfirmCompleteTask(null);
      setConfirmUndoTask(null);
    }
  };


  // Add Task manually
  const proceedWithTaskCreation = async (finalName: string) => {
    const taskId = 'tsk_' + Math.random().toString(36).substring(2, 9);
    
    let finalDeadlineDate = newTask.deadlineDate;
    let finalDeadlineTime = newTask.deadlineTime;
    
    if (!finalDeadlineDate) {
      const today = new Date();
      const yr = today.getFullYear();
      const mo = String(today.getMonth() + 1).padStart(2, '0');
      const dy = String(today.getDate()).padStart(2, '0');
      finalDeadlineDate = `${yr}-${mo}-${dy}`;
      finalDeadlineTime = '17:00';
    }

    const combinedDeadline = `${finalDeadlineDate}T${finalDeadlineTime || '17:00'}`;
    const docData: Task = {
      id: taskId,
      name: finalName,
      deadline: combinedDeadline,
      estimatedEffort: Number(newTask.estimatedEffort) || 1,
      totalHours: Number(newTask.estimatedEffort) || 1,
      priority: newTask.priority,
      category: newTask.category,
      completed: false,
      subtasks: [],
      createdAt: new Date().toISOString(),
      dailyHoursAvailable: newTask.dailyHoursAvailable,
      availableDays: newTask.availableDays
    };

    try {
      setShowRescheduleBanner(false);
      await setDoc(doc(db, 'users', userId, 'tasks', taskId), docData);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `users/${userId}/tasks/${taskId}`);
    }
    
    setIsAddModalOpen(false);
    setNewTaskStep(1);
    setValidationState({ type: 'idle', originalName: '' });

    const d = new Date();
    d.setDate(d.getDate() + 1);
    const yr = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const dy = String(d.getDate()).padStart(2, '0');

    setNewTask({
      name: '',
      deadlineDate: `${yr}-${mo}-${dy}`,
      deadlineTime: '18:00',
      estimatedEffort: 1,
      priority: 'medium',
      category: 'work',
      dailyHoursAvailable: 4,
      availableDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    });

    // Reveal Autopilot tab
    setActiveTab('autopilot');

    // Proactively decompose newly added manual task
    handleDecompressTask(docData);
    
    // Recalculate schedule
    recalculateSchedule();
  };

  const triggerValidation = async (taskName: string) => {
    setTaskCreationError(null);
    setValidationState({ type: 'loading', originalName: taskName });
    
    try {
      const response = await fetch('/api/validate-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskName })
      });
      
      if (response.ok) {
        const resData = await response.json();
        const { confidence, isMeaningless, isVeryShort, suggestedQuestion, spellingCorrection } = resData;
        
        if (isMeaningless || confidence < 80) {
          if (isVeryShort && suggestedQuestion) {
            setValidationState({
              type: 'vague',
              originalName: taskName,
              suggestedQuestion,
              vagueResponse: ''
            });
          } else {
            setValidationState({
              type: 'meaningless',
              originalName: taskName
            });
          }
        } else if (spellingCorrection && spellingCorrection.trim().toLowerCase() !== taskName.trim().toLowerCase()) {
          setValidationState({
            type: 'spelling',
            originalName: taskName,
            correctedName: spellingCorrection
          });
        } else if (isVeryShort && suggestedQuestion) {
          setValidationState({
            type: 'vague',
            originalName: taskName,
            suggestedQuestion,
            vagueResponse: ''
          });
        } else {
          await proceedWithTaskCreation(taskName);
        }
      } else {
        await proceedWithTaskCreation(taskName);
      }
    } catch (error) {
      console.error("Task validation failed:", error);
      await proceedWithTaskCreation(taskName);
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTask.name.trim()) return;

    if (isDeadlineInPast()) {
      setTaskCreationError("This deadline has already passed. Please choose a future date and time.");
      return;
    }

    setTaskCreationError(null);
    await triggerValidation(newTask.name);
  };

  // Request Draft immediately under selected template
  const requestExtensionDraft = (task: Task) => {
    const baseDate = new Date(task.deadline);
    const newDeadlineDate = new Date(baseDate);
    newDeadlineDate.setDate(newDeadlineDate.getDate() + 3);
    
    const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric' };
    const formattedNewDeadline = newDeadlineDate.toLocaleDateString('en-US', options);

    const prompt = `Let's draft a message requesting an extension for my task "${task.name}". The category is ${task.category} and priority is ${task.priority}. The current deadline is ${task.deadline}. I want to ask for a new deadline of "${formattedNewDeadline}" (which is exactly 3 days after the original deadline). Write the draft in a ${draftModificationTone} tone directly and beautifully. The subject line must include the task name "${task.name}" automatically. Do not include any placeholders like "[Insert Date]".`;
    handleSendMessage(prompt);
  };

  // Delete Task
  const handleDeleteTask = async (taskId: string) => {
    if (userId) {
      try {
        await deleteDoc(doc(db, 'users', userId, 'tasks', taskId));
        recalculateSchedule();
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `users/${userId}/tasks/${taskId}`);
      }
    }
  };

  const handleStartEditTask = (task: Task) => {
    if (editingTaskId === task.id) {
      setEditingTaskId(null);
      setEditForm(null);
    } else {
      setEditingTaskId(task.id);
      setEditForm({
        name: task.name,
        deadline: task.deadline,
        estimatedEffort: task.estimatedEffort,
        priority: task.priority,
        category: task.category
      });
    }
  };

  const handleCancelEditTask = () => {
    setEditingTaskId(null);
    setEditForm(null);
  };

  const handleSaveEditTask = async (originalTask: Task) => {
    if (!userId || !editForm) return;

    if (!editForm.name.trim()) {
      alert("Please enter a valid task name.");
      return;
    }

    const nameChanged = editForm.name !== originalTask.name;
    const categoryChanged = editForm.category !== originalTask.category;
    const effortChanged = editForm.estimatedEffort !== originalTask.estimatedEffort;

    try {
      setIsAutopilotRecalculating(true);
      const taskRef = doc(db, 'users', userId, 'tasks', originalTask.id);

      const updatedFields: Partial<Task> = {
        name: editForm.name,
        deadline: editForm.deadline,
        estimatedEffort: editForm.estimatedEffort,
        priority: editForm.priority,
        category: editForm.category
      };

      if (effortChanged) {
        updatedFields.subtasks = [];
      }

      await updateDoc(taskRef, updatedFields);

      // Trigger success toast
      setTaskToasts(prev => ({ ...prev, [originalTask.id]: "Task updated — schedule recalculated" }));
      setTimeout(() => {
        setTaskToasts(prev => {
          const next = { ...prev };
          delete next[originalTask.id];
          return next;
        });
      }, 3000);

      // Collapse edit panel
      setEditingTaskId(null);
      setEditForm(null);

      if (effortChanged || nameChanged || categoryChanged) {
        const fullTask: Task = {
          ...originalTask,
          ...updatedFields,
          subtasks: []
        };
        setDecompressingTasks(prev => {
          const next = { ...prev };
          delete next[originalTask.id];
          return next;
        });
        await handleDecompressTask(fullTask);
      } else {
        await recalculateSchedule();
      }
    } catch (err) {
      console.error("Failed to edit task:", err);
      handleFirestoreError(err, OperationType.UPDATE, `users/${userId}/tasks/${originalTask.id}`);
    } finally {
      setIsAutopilotRecalculating(false);
    }
  };

  // Change individual draft details
  const updateDraftTone = async (tone: 'professional' | 'apologetic' | 'negotiating') => {
    setDraftModificationTone(tone);
    if (!emailDraft) return;
    setIsSending(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            {
              role: 'user',
              content: `Please convert this draft body: "${emailDraft.body}" into a highly original, compelling ${tone} text/email layout. Keep the subject line similar.`
            }
          ],
          currentTasks: tasks,
          currentDateTime: getTodayDateString()
        })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.emailDraft) {
          setEmailDraft(data.emailDraft);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSending(false);
    }
  };

  // Clipboard Copier
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('Copied successfully to clipboard!');
  };

  // Calculate high-level values
  const totalIncompleteHours = tasks
    .filter(t => !t.completed)
    .reduce((sum, t) => sum + t.estimatedEffort, 0);

  const activeTasks = tasks.filter(t => !t.completed);
  const completedTasks = tasks.filter(t => t.completed);

  // Filter tasks based on settings
  const filteredTasks = tasks.filter(t => {
    const categoryMatches = activeCategoryFilter === 'all' || t.category === activeCategoryFilter;
    const priorityMatches = activePriorityFilter === 'all' || t.priority === activePriorityFilter;
    return categoryMatches && priorityMatches;
  });

  // Calculate stress ring coloring
  const getStressColor = (score: number) => {
    if (score < 4) return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
    if (score < 7) return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
    return 'text-rose-400 bg-rose-500/10 border-rose-500/20';
  };

  // Quick helper to categorize deadline
  const formatDeadline = (dateStr: string) => {
    const dateObj = new Date(dateStr);
    const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    return dateObj.toLocaleDateString('en-US', options);
  };

  const formatPanicTimer = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getPlannedDaysCount = () => {
    const total = Number(newTask.estimatedEffort) || 0.5;
    const daily = Number(newTask.dailyHoursAvailable) || 4;
    const daysNeeded = Math.ceil(total / daily);
    if (!newTask.availableDays || newTask.availableDays.length === 0) return 0;
    
    let daysSpan = 0;
    let workDaysAcc = 0;
    const current = new Date();
    const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    while (workDaysAcc < daysNeeded && daysSpan < 365) {
      const dayName = weekdayNames[current.getDay()];
      if (newTask.availableDays.includes(dayName)) {
        workDaysAcc++;
      }
      daysSpan++;
      current.setDate(current.getDate() + 1);
    }
    return daysSpan;
  };

  return (
    <div 
      className="min-h-screen bg-[#F5F3FF] text-[#26215C] font-sans selection:bg-[#7F77DD]/30 selection:text-[#534AB7] pb-16 transition-colors duration-300"
    >
      {/* Reschedule Banner at top (purple strip) — shows when Coach auto-acts */}
      {showRescheduleBanner && (
        <div 
          onClick={() => {
            document.getElementById('autopilot-schedule-container')?.scrollIntoView({ behavior: 'smooth' });
          }}
          className="bg-[#7F77DD] text-white text-xs font-black py-3 px-4 text-center cursor-pointer hover:bg-[#6b62ce] transition-colors flex items-center justify-center gap-2 select-none animate-fade-in z-50 sticky top-0"
        >
          <Brain className="w-4 h-4 animate-bounce" />
          <span>Coach rescheduled your plan — tap to review</span>
          <ArrowUpRight className="w-3.5 h-3.5" />
        </div>
      )}

      {/* Premium Top Navigation header */}
      <header className="border-b border-[#CECBF6] bg-white/80 backdrop-blur-md sticky top-0 z-40 navbar">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3.5" id="brand-header">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#7F77DD] to-[#534AB7] flex items-center justify-center shadow-lg shadow-[#7F77DD]/25">
              <Flame className="w-5.5 h-5.5 text-white stroke-[2.2]" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold tracking-tight text-[#26215C] flex items-center gap-2">
                LifeSaver AI
                <span className="text-[10px] font-semibold tracking-widest text-[#7F77DD] bg-[#EEEDFE] px-2.5 py-0.5 rounded-full border border-[#CECBF6] animate-pulse">AUTOPILOT</span>
              </h1>
              <p className="text-xs text-[#534AB7] font-medium">Beating deadlines, side-by-side with you.</p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            {/* Work Style Selector */}
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#F5F3FF] border border-[#CECBF6]">
              <span className="text-[10px] font-black text-[#534AB7] uppercase tracking-wider pl-0.5">Vibe:</span>
              <select
                value={onboardingWorkStyle}
                onChange={(e) => {
                  const val = e.target.value as 'bursts' | 'structure' | 'grind';
                  setOnboardingWorkStyle(val);
                  localStorage.setItem('lifesaver_workstyle', val);
                  // Wrap in small timeout to ensure state is updated
                  setTimeout(() => {
                    recalculateSchedule();
                  }, 50);
                }}
                className="bg-transparent border-none text-xs font-bold text-[#26215C] focus:outline-none cursor-pointer pr-1"
                id="workstyle-selector"
              >
                <option value="bursts">🏃‍♂️ Bursts</option>
                <option value="structure">🗺️ Structure</option>
                <option value="grind">🩸 Grind</option>
              </select>
            </div>
            <button 
              onClick={() => recalculateSchedule()}
              disabled={isSending}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white hover:bg-[#EEEDFE] border border-[#CECBF6] text-xs font-bold text-[#534AB7] hover:text-[#26215C] transition group disabled:opacity-50 cursor-pointer shadow-sm"
              id="recalculate-schedule-btn"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-[#7F77DD] group-hover:rotate-180 transition-transform duration-500 ${isSending ? 'animate-spin' : ''}`} />
              Sync Brain
            </button>
            <button 
            onClick={() => {
                setNewTaskStep(1);
                const d = new Date();
                d.setDate(d.getDate() + 1);
                const yr = d.getFullYear();
                const mo = String(d.getMonth() + 1).padStart(2, '0');
                const dy = String(d.getDate()).padStart(2, '0');
                setNewTask({
                  name: '',
                  deadlineDate: `${yr}-${mo}-${dy}`,
                  deadlineTime: '18:00',
                  estimatedEffort: 1,
                  priority: 'medium',
                  category: 'study',
                  dailyHoursAvailable: 4,
                  availableDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
                });
                setIsAddModalOpen(true);
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#7F77DD] hover:bg-[#6b62ce] text-white font-bold text-xs shadow-lg shadow-[#7F77DD]/30 transition-all cursor-pointer"
              id="top-add-task-btn"
            >
              <Plus className="w-4 h-4 text-white stroke-[3]" />
              New Task
            </button>
          </div>
        </div>
      </header>

      {/* Main Interactive Workspace Area */}
      <main className="max-w-7xl mx-auto px-4 py-6 flex flex-col lg:flex-row gap-6 pb-24">
        
        {/* Main Content (Left Column on Desktop, Flex-1) */}
        <section className="flex-1 space-y-6 flex flex-col min-w-0" id="main-content-column">
          
          {/* Sub-Navigation Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 pb-2 border-b border-[#CECBF6]" id="workspace-tabs-nav">
            <button
              onClick={() => setActiveTab('autopilot')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-200 cursor-pointer ${
                activeTab === 'autopilot'
                  ? 'bg-[#7F77DD] text-white shadow-md shadow-[#7F77DD]/20'
                  : 'text-[#534AB7] bg-white hover:bg-[#EEEDFE] border border-[#CECBF6]'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Autopilot Plan</span>
            </button>
            <button
              onClick={() => setActiveTab('goals')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-200 cursor-pointer ${
                activeTab === 'goals'
                  ? 'bg-[#7F77DD] text-white shadow-md shadow-[#7F77DD]/20'
                  : 'text-[#534AB7] bg-white hover:bg-[#EEEDFE] border border-[#CECBF6]'
              }`}
            >
              <Flame className="w-3.5 h-3.5" />
              <span>Goals & Habits</span>
              {streakCount > 0 && (
                <span className="bg-amber-400 text-slate-900 px-1.5 py-0.5 rounded-full text-[9px] font-black animate-pulse">
                  {streakCount}🔥
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('insights')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-200 cursor-pointer ${
                activeTab === 'insights'
                  ? 'bg-[#7F77DD] text-white shadow-md shadow-[#7F77DD]/20'
                  : 'text-[#534AB7] bg-white hover:bg-[#EEEDFE] border border-[#CECBF6]'
              }`}
            >
              <Brain className="w-3.5 h-3.5" />
              <span>Smart Insights</span>
            </button>
            <button
              onClick={() => setActiveTab('integrations')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-200 cursor-pointer ${
                activeTab === 'integrations'
                  ? 'bg-[#7F77DD] text-white shadow-md shadow-[#7F77DD]/20'
                  : 'text-[#534AB7] bg-white hover:bg-[#EEEDFE] border border-[#CECBF6]'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Google Calendar</span>
              {calendarEvents.length > 0 && (
                <span className="bg-emerald-500 text-white px-1.5 py-0.5 rounded-full text-[9px] font-black">
                  {calendarEvents.length}
                </span>
              )}
            </button>
          </div>

          {/* TAB 1: AUTOPILOT SCHEDULE & TASKS */}
          {activeTab === 'autopilot' && (
            <div className="space-y-6 flex flex-col">
              {/* Procrastination Nudge Banner (Behavior 5) */}
              {procrastinationNudge && (
                <div className="bg-white border border-[#CECBF6] rounded-xl p-4 flex items-start gap-4 shadow-sm relative overflow-hidden group shrink-0" id="procrastination-nudge-banner">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-[#EEEDFE] blur-3xl pointer-events-none rounded-full"></div>
                  <div className="w-10 h-10 rounded-xl bg-[#EEEDFE] flex items-center justify-center border border-[#CECBF6] shrink-0">
                    <Brain className="w-5 h-5 text-[#7F77DD] animate-pulse" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] uppercase font-bold tracking-widest text-[#7F77DD]">Survival Kick-start</span>
                    <p className="text-[#26215C] text-sm mt-0.5 leading-relaxed font-semibold">"{procrastinationNudge}"</p>
                  </div>
                  <button 
                    onClick={() => setProcrastinationNudge('')} 
                    className="p-1 rounded-lg hover:bg-[#EEEDFE] border border-transparent hover:border-[#CECBF6] text-[#888780] hover:text-[#26215C] transition cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* 3. MAIN COLUMN top: Row of 3 stat cards */}
              <StatCards 
                tasks={tasks}
                pressureScore={pressureScore}
              />

              {/* 4. MAIN COLUMN middle: 7-Day Autopilot card */}
              <AutopilotCard 
                tasks={tasks}
                autopilotSchedule={autopilotSchedule}
                isAutopilotRecalculating={isAutopilotRecalculating}
                warnings={warnings}
                calendarEvents={calendarEvents}
                isGcalConnected={!!gcalUser}
              />

              {/* 5. MAIN COLUMN bottom: Active Task Board */}
              <TaskBoard 
                tasks={tasks}
                filteredTasks={filteredTasks}
                activeCategoryFilter={activeCategoryFilter}
                setActiveCategoryFilter={setActiveCategoryFilter}
                handleToggleTaskCompleted={handleToggleTaskCompleted}
                handleDecompressTask={handleDecompressTask}
                decompressingTasks={decompressingTasks}
                handleToggleConsequences={handleToggleConsequences}
                loadingConsequences={loadingConsequences}
                expandedConsequences={expandedConsequences}
                handleToggleSubtask={handleToggleSubtask}
                requestExtensionDraft={requestExtensionDraft}
                handleDeleteTask={handleDeleteTask}
                editingTaskId={editingTaskId}
                setEditingTaskId={setEditingTaskId}
                editForm={editForm}
                setEditForm={setEditForm}
                handleSaveEditTask={handleSaveEditTask}
                handleCancelEditTask={handleCancelEditTask}
                taskToasts={taskToasts}
              />
            </div>
          )}

          {/* TAB 2: GOALS & HABITS TRACKER */}
          {activeTab === 'goals' && (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6" id="goals-habits-panel">
              
              {/* Left Side: Streak Dashboard & Metrics */}
              <div className="md:col-span-5 space-y-6">
                
                {/* Active Streak Card */}
                <div className="bg-gradient-to-br from-[#7F77DD] to-[#534AB7] text-white rounded-xl p-5 shadow-lg border border-[#CECBF6]/20 relative overflow-hidden">
                  <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-black uppercase tracking-widest text-amber-300">Habit Streaks</span>
                    <Flame className="w-6 h-6 text-amber-400 fill-amber-400 animate-bounce" />
                  </div>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-4xl font-extrabold tracking-tight">{streakCount}</span>
                    <span className="text-sm font-semibold text-white/80">consecutive days</span>
                  </div>
                  <p className="text-xs font-medium text-white/80 leading-relaxed mt-3">
                    Your focus is locked! Completing subtasks, habits, or saving schedules feeds this streak. Don't let it slip tomorrow!
                  </p>
                </div>

                {/* Productivity Score Card */}
                <div className="bg-white border border-[#CECBF6] rounded-xl p-5 shadow-sm">
                  <h3 className="text-sm font-black text-[#26215C] uppercase tracking-wider mb-4 flex items-center gap-1.5">
                    <Award className="w-4 h-4 text-[#7F77DD]" />
                    Productivity Dashboard
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-xs font-bold mb-1.5">
                        <span className="text-[#534AB7]">Weekly Score</span>
                        <span className="text-[#26215C] font-black">
                          {Math.round(Math.min(100, (tasks.filter(t=>t.completed).length / (tasks.length || 1)) * 60 + (streakCount * 5) + (goals.filter(g=>g.completed).length * 10)))}/100
                        </span>
                      </div>
                      <div className="w-full bg-[#EEEDFE] rounded-full h-2.5">
                        <div 
                          className="bg-gradient-to-r from-[#7F77DD] to-[#534AB7] h-2.5 rounded-full transition-all duration-500"
                          style={{ width: `${Math.min(100, (tasks.filter(t=>t.completed).length / (tasks.length || 1)) * 60 + (streakCount * 5) + (goals.filter(g=>g.completed).length * 10))}%` }}
                        ></div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2 text-center">
                      <div className="bg-[#F5F3FF] border border-[#CECBF6]/50 p-3 rounded-xl">
                        <span className="text-[10px] text-[#534AB7] uppercase font-black tracking-widest block">Completed</span>
                        <span className="text-xl font-extrabold text-[#26215C] mt-0.5 block">{tasks.filter(t=>t.completed).length}</span>
                      </div>
                      <div className="bg-[#F5F3FF] border border-[#CECBF6]/50 p-3 rounded-xl">
                        <span className="text-[10px] text-[#534AB7] uppercase font-black tracking-widest block">Active Goals</span>
                        <span className="text-xl font-extrabold text-[#26215C] mt-0.5 block">{goals.filter(g=>!g.completed).length}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Daily Habits checklist */}
                <div className="bg-white border border-[#CECBF6] rounded-xl p-5 shadow-sm">
                  <h3 className="text-sm font-black text-[#26215C] uppercase tracking-wider mb-4 flex items-center gap-1.5">
                    <CheckSquare2 className="w-4 h-4 text-[#7F77DD]" />
                    Daily Performance Habits
                  </h3>
                  <div className="space-y-2.5">
                    {dailyHabits.map(habit => (
                      <div 
                        key={habit.id}
                        onClick={() => handleToggleHabit(habit.id)}
                        className={`flex items-center gap-3 p-3 rounded-xl border transition cursor-pointer select-none font-bold text-xs ${
                          habit.completed 
                            ? 'bg-[#EEEDFE]/40 border-[#7F77DD]/40 text-[#534AB7] line-through' 
                            : 'bg-[#F5F3FF] hover:bg-[#EEEDFE] border-[#CECBF6] text-[#26215C]'
                        }`}
                      >
                        <div className={`w-4.5 h-4.5 rounded-md flex items-center justify-center border transition ${
                          habit.completed ? 'bg-[#7F77DD] border-[#7F77DD] text-white' : 'border-[#CECBF6] bg-white'
                        }`}>
                          {habit.completed && <Check className="w-3 h-3 text-white stroke-[3]" />}
                        </div>
                        <span>{habit.name}</span>
                      </div>
                    ))}
                  </div>
                </div>

              </div>

              {/* Right Side: Durable Goals List */}
              <div className="md:col-span-7 space-y-6">
                
                {/* Active Goals card */}
                <div className="bg-white border border-[#CECBF6] rounded-xl p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-black text-[#26215C] uppercase tracking-wider flex items-center gap-1.5">
                      <PlusSquare className="w-4.5 h-4.5 text-[#7F77DD]" />
                      Personal Productivity Goals
                    </h3>
                    {!isAddingGoal && (
                      <button 
                        onClick={() => setIsAddingGoal(true)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#F5F3FF] hover:bg-[#EEEDFE] border border-[#CECBF6] text-[10px] font-black uppercase text-[#534AB7] cursor-pointer transition"
                      >
                        <Plus className="w-3 h-3" />
                        Add Goal
                      </button>
                    )}
                  </div>

                  {/* Add goal inline form */}
                  {isAddingGoal && (
                    <form onSubmit={handleCreateGoal} className="bg-[#F5F3FF] border border-[#CECBF6] p-4 rounded-xl space-y-3 mb-4 animate-fade-in">
                      <div className="flex items-center justify-between border-b border-[#CECBF6] pb-2 mb-2">
                        <span className="text-[10px] font-black uppercase tracking-wider text-[#534AB7]">New Target Goal</span>
                        <button 
                          type="button" 
                          onClick={() => setIsAddingGoal(false)}
                          className="p-1 rounded text-[#888780] hover:text-[#26215C]"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="space-y-2">
                        <div>
                          <label className="text-[10px] uppercase font-black text-[#534AB7] block mb-1">Goal Description</label>
                          <input 
                            type="text" 
                            value={newGoalTitle}
                            onChange={e => setNewGoalTitle(e.target.value)}
                            placeholder="e.g. Study Chemistry 3 times daily"
                            className="w-full bg-white border border-[#CECBF6] focus:border-[#7F77DD] rounded-lg px-3 py-2 text-xs font-bold text-[#26215C] focus:outline-none"
                            required
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-[10px] uppercase font-black text-[#534AB7] block mb-1">Target Amount</label>
                            <input 
                              type="number" 
                              value={newGoalTarget}
                              onChange={e => setNewGoalTarget(Number(e.target.value) || 1)}
                              min="1"
                              className="w-full bg-white border border-[#CECBF6] focus:border-[#7F77DD] rounded-lg px-3 py-2 text-xs font-bold text-[#26215C] focus:outline-none"
                              required
                            />
                          </div>
                          <div>
                            <label className="text-[10px] uppercase font-black text-[#534AB7] block mb-1">Goal Period</label>
                            <select 
                              value={newGoalType}
                              onChange={e => setNewGoalType(e.target.value as 'daily' | 'weekly')}
                              className="w-full bg-white border border-[#CECBF6] focus:border-[#7F77DD] rounded-lg px-3 py-2 text-xs font-bold text-[#26215C] focus:outline-none"
                            >
                              <option value="daily">Daily</option>
                              <option value="weekly">Weekly</option>
                            </select>
                          </div>
                        </div>
                      </div>
                      <button 
                        type="submit"
                        className="w-full bg-[#7F77DD] hover:bg-[#6b62ce] text-white text-[10px] font-black uppercase tracking-widest py-2 rounded-lg transition"
                      >
                        Add Goal to Firestore
                      </button>
                    </form>
                  )}

                  {/* Goal list */}
                  <div className="space-y-3">
                    {goals.map(goal => {
                      const percent = Math.min(100, Math.round((goal.current / goal.target) * 100));
                      return (
                        <div key={goal.id} className="bg-[#F5F3FF] border border-[#CECBF6]/60 rounded-xl p-4 flex flex-col relative overflow-hidden">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border mb-1.5 inline-block ${
                                goal.type === 'daily' 
                                  ? 'bg-[#EEEDFE] border-[#CECBF6] text-[#534AB7]' 
                                  : 'bg-emerald-50 border-emerald-100 text-emerald-700'
                              }`}>
                                {goal.type}
                              </span>
                              <h4 className={`text-xs font-black text-[#26215C] ${goal.completed ? 'line-through opacity-60' : ''}`}>
                                {goal.title}
                              </h4>
                            </div>
                            <div className="text-right">
                              <span className="text-xs font-extrabold text-[#534AB7]">{goal.current} / {goal.target}</span>
                              <span className="text-[10px] font-black text-[#26215C] block opacity-80 mt-0.5">{percent}%</span>
                            </div>
                          </div>
                          <div className="w-full bg-white border border-[#CECBF6]/40 rounded-full h-2 mt-3 overflow-hidden">
                            <div 
                              className={`h-2 rounded-full transition-all duration-500 ${
                                goal.completed ? 'bg-emerald-500' : 'bg-[#7F77DD]'
                              }`}
                              style={{ width: `${percent}%` }}
                            ></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>

            </div>
          )}

          {/* TAB 3: CONTEXT-AWARE SMART REMINDERS & INSIGHTS */}
          {activeTab === 'insights' && (
            <div className="space-y-6" id="smart-insights-panel">
              
              {/* Context-Aware Smart Reminders Grid */}
              <div className="bg-white border border-[#CECBF6] rounded-xl p-5 shadow-sm">
                <h3 className="text-sm font-black text-[#26215C] uppercase tracking-wider mb-4 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  Context-Aware Smart Alerts
                </h3>
                <div className="space-y-3">
                  {/* Generate reminders dynamically from actual live state! */}
                  {(() => {
                    const active = tasks.filter(t => !t.completed);
                    const alerts: React.ReactNode[] = [];
                    const now = new Date().getTime();

                    active.forEach(t => {
                      const dl = new Date(t.deadline).getTime();
                      const hoursLeft = (dl - now) / (3600 * 1000);
                      
                      if (hoursLeft > 0 && hoursLeft <= 24) {
                        alerts.push(
                          <div key={`al_urg_${t.id}`} className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex gap-3.5 items-start">
                            <AlertOctagon className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                            <div>
                              <p className="text-xs font-black text-rose-900 uppercase tracking-wider">Critical Proximity Alert</p>
                              <p className="text-xs text-rose-800 font-semibold mt-0.5">
                                "{t.name}" due in {Math.round(hoursLeft)} hours. Estimated remaining workload: {t.estimatedEffort} hours. Start now to meet the deadline.
                              </p>
                            </div>
                          </div>
                        );
                      } else if (hoursLeft > 24 && hoursLeft <= 72 && t.priority === 'high') {
                        alerts.push(
                          <div key={`al_warn_${t.id}`} className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex gap-3.5 items-start">
                            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                            <div>
                              <p className="text-xs font-black text-amber-900 uppercase tracking-wider">High Importance Alert</p>
                              <p className="text-xs text-amber-800 font-semibold mt-0.5">
                                High-priority task "{t.name}" is scheduled. Ensure you begin preparation today to prevent deadline pressure.
                              </p>
                            </div>
                          </div>
                        );
                      }
                    });

                    // General alerts based on remaining capacity
                    const totalRemainingEffort = active.reduce((sum, t) => sum + t.estimatedEffort, 0);
                    if (totalRemainingEffort > 12) {
                      alerts.push(
                        <div key="al_cap" className="p-4 bg-[#F5F3FF] border border-[#CECBF6] rounded-xl flex gap-3.5 items-start">
                          <Activity className="w-5 h-5 text-[#7F77DD] shrink-0 mt-0.5" />
                          <div>
                            <p className="text-xs font-black text-[#26215C] uppercase tracking-wider">Overload Alert</p>
                            <p className="text-xs text-[#534AB7] font-semibold mt-0.5">
                              Your remaining incomplete task workload stands at {totalRemainingEffort} hours. Ask Coach LifeSaver to defer or adjust task durations.
                            </p>
                          </div>
                        </div>
                      );
                    }

                    // Baseline reminders if no specific task triggers
                    if (alerts.length === 0) {
                      alerts.push(
                        <div key="al_empty" className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl flex gap-3.5 items-start">
                          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                          <div>
                            <p className="text-xs font-black text-emerald-900 uppercase tracking-wider">Perfect Alignment</p>
                            <p className="text-xs text-emerald-800 font-semibold mt-0.5">
                              All deadlines are within safe limits. No urgent scheduling conflicts detected. You are completely on track!
                            </p>
                          </div>
                        </div>
                      );
                    }

                    return alerts;
                  })()}
                </div>
              </div>

              {/* Personalized Productivity Recommendations */}
              <div className="bg-white border border-[#CECBF6] rounded-xl p-5 shadow-sm">
                <h3 className="text-sm font-black text-[#26215C] uppercase tracking-wider mb-4 flex items-center gap-1.5">
                  <Brain className="w-4 h-4 text-[#7F77DD]" />
                  Personalized Productivity Recommendations
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 bg-[#F5F3FF] border border-[#CECBF6]/50 rounded-xl relative overflow-hidden">
                    <span className="text-[9px] font-black uppercase tracking-widest text-[#7F77DD]">Optimal Focus Time</span>
                    <h4 className="text-xs font-black text-[#26215C] mt-1.5">Prime Completion Window</h4>
                    <p className="text-xs font-medium text-[#534AB7] leading-relaxed mt-1">
                      You complete coding & study tasks 30% faster between 9 AM and 12 PM. Plan high-priority efforts inside this window.
                    </p>
                  </div>

                  <div className="p-4 bg-[#F5F3FF] border border-[#CECBF6]/50 rounded-xl relative overflow-hidden">
                    <span className="text-[9px] font-black uppercase tracking-widest text-[#7F77DD]">Mental Energy Cap</span>
                    <h4 className="text-xs font-black text-[#26215C] mt-1.5">Night Work Limitations</h4>
                    <p className="text-xs font-medium text-[#534AB7] leading-relaxed mt-1">
                      Avoid scheduling deep focus work after 8 PM based on past performance metrics. Swap for simple administrative tasks.
                    </p>
                  </div>

                  <div className="p-4 bg-[#F5F3FF] border border-[#CECBF6]/50 rounded-xl relative overflow-hidden">
                    <span className="text-[9px] font-black uppercase tracking-widest text-[#7F77DD]">Task Structuring</span>
                    <h4 className="text-xs font-black text-[#26215C] mt-1.5">Decompression Strategy</h4>
                    <p className="text-xs font-medium text-[#534AB7] leading-relaxed mt-1">
                      Break tasks exceeding 3 hours into separate 90-minute blocks. This increases completion probability by 70%.
                    </p>
                  </div>

                  <div className="p-4 bg-[#F5F3FF] border border-[#CECBF6]/50 rounded-xl relative overflow-hidden">
                    <span className="text-[9px] font-black uppercase tracking-widest text-[#7F77DD]">Procrastination Risk</span>
                    <h4 className="text-xs font-black text-[#26215C] mt-1.5">End-Of-Week Load</h4>
                    <p className="text-xs font-medium text-[#534AB7] leading-relaxed mt-1">
                      Thursdays feature higher procrastination rates in work categories. Use the Voice Dump feature early to set strict micro-milestones.
                    </p>
                  </div>
                </div>
              </div>

              {/* AI Productivity Coach Live Review */}
              <div className="bg-[#EEEDFE]/40 border border-[#CECBF6] rounded-xl p-5 shadow-sm relative overflow-hidden">
                <div className="absolute right-0 top-0 w-32 h-32 bg-[#EEEDFE] blur-3xl pointer-events-none rounded-full"></div>
                <div className="flex items-start justify-between flex-wrap gap-4 mb-4">
                  <div>
                    <h3 className="text-sm font-black text-[#26215C] uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-[#7F77DD] stroke-[2.5]" />
                      AI Coach live performance audit
                    </h3>
                    <p className="text-xs font-medium text-[#534AB7] mt-1">
                      Review schedule overloads, detect Google Calendar clashes, and generate real-time feedback with Gemini.
                    </p>
                  </div>
                  <button
                    onClick={async () => {
                      setIsCoachingReviewLoading(true);
                      setCoachingReview('');
                      try {
                        const response = await fetch('/api/chat', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            messages: [
                              {
                                role: 'user',
                                content: 'Identify schedule overloads, Google Calendar conflicts, and write a detailed Coach Review with encouraging advice.'
                              }
                            ],
                            currentTasks: tasks,
                            currentDateTime: getTodayDateString(),
                            currentCalendarEvents: calendarEvents,
                            goals: goals,
                            streakCount: streakCount
                          })
                        });
                        if (response.ok) {
                          const data = await response.json();
                          setCoachingReview(data.reply || 'Audit completed successfully.');
                        } else {
                          setCoachingReview('Could not complete live performance review right now.');
                        }
                      } catch (err) {
                        setCoachingReview('API communication error.');
                      } finally {
                        setIsCoachingReviewLoading(false);
                      }
                    }}
                    disabled={isCoachingReviewLoading}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#7F77DD] hover:bg-[#6b62ce] text-white font-bold text-xs shadow transition disabled:opacity-50 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isCoachingReviewLoading ? 'animate-spin' : ''}`} />
                    Audit My Schedule
                  </button>
                </div>

                {isCoachingReviewLoading && (
                  <div className="p-8 flex flex-col items-center justify-center gap-3">
                    <Sparkles className="w-8 h-8 text-[#7F77DD] animate-spin" />
                    <span className="text-xs font-bold text-[#534AB7]">Gemini is auditing your current schedule load and commitments...</span>
                  </div>
                )}

                {coachingReview && (
                  <div className="bg-white border border-[#CECBF6] p-4.5 rounded-xl text-xs leading-relaxed text-[#3C3489] font-medium whitespace-pre-wrap animate-fade-in shadow-xs">
                    <p className="text-[10px] font-black uppercase tracking-widest text-[#7F77DD] mb-2 border-b border-[#CECBF6] pb-1.5">Coach Review Output</p>
                    {coachingReview}
                  </div>
                )}
              </div>

            </div>
          )}

          {/* TAB 4: GOOGLE CALENDAR INTEGRATION */}
          {activeTab === 'integrations' && (
            <div className="space-y-6" id="google-calendar-panel">
              
              {/* Google Connection Header Card */}
              <div className="bg-white border border-[#CECBF6] rounded-xl p-5 shadow-sm">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div className="flex items-center space-x-3.5">
                    <div className="w-10 h-10 rounded-xl bg-[#EEEDFE] flex items-center justify-center border border-[#CECBF6]">
                      <CalendarDays className="w-5.5 h-5.5 text-[#7F77DD]" />
                    </div>
                    <div>
                      <h3 className="text-base font-extrabold text-[#26215C]">Google Workspace Connection</h3>
                      <p className="text-xs text-[#534AB7] font-medium">Connect Google Calendar to import busy slots and avoid overloads.</p>
                    </div>
                  </div>

                  {gcalUser ? (
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <span className="text-[10px] font-black text-emerald-600 block bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full uppercase tracking-wider inline-block">Active Sync</span>
                        <span className="text-xs font-bold text-[#26215C] block mt-0.5">{gcalUser.email}</span>
                      </div>
                      <button 
                        onClick={handleGcalDisconnect}
                        className="p-2.5 rounded-xl hover:bg-rose-50 border border-[#CECBF6] text-rose-600 transition cursor-pointer"
                        title="Disconnect account"
                      >
                        <LogOut className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button 
                      onClick={handleGcalConnect}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white hover:bg-[#EEEDFE] border border-[#CECBF6] text-xs font-extrabold text-[#534AB7] transition shadow-sm cursor-pointer"
                    >
                      <LogIn className="w-4 h-4 text-[#7F77DD]" />
                      Connect Google Calendar
                    </button>
                  )}
                </div>
              </div>

              {/* Only show Calendar widgets when connected */}
              {gcalUser ? (
                <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                  
                  {/* Left Side: Conflict Detector & Export Action */}
                  <div className="md:col-span-5 space-y-6">
                    
                    {/* One-click Export Card */}
                    <div className="bg-white border border-[#CECBF6] rounded-xl p-5 shadow-sm">
                      <h3 className="text-sm font-black text-[#26215C] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <ArrowUpRight className="w-4.5 h-4.5 text-[#7F77DD]" />
                        Export Autopilot Schedule
                      </h3>
                      <p className="text-xs font-medium text-[#534AB7] leading-relaxed mb-4">
                        Push all AI-allocated daily focus times directly into your Google Calendar with a single click.
                      </p>
                      <button
                        onClick={handleExportScheduleToCalendar}
                        className="w-full py-2.5 rounded-xl bg-[#7F77DD] hover:bg-[#6b62ce] text-white text-[10px] font-black uppercase tracking-widest shadow-md shadow-[#7F77DD]/20 transition"
                      >
                        Export to Google Calendar
                      </button>
                    </div>

                    {/* Conflict Detector Card */}
                    <div className="bg-white border border-[#CECBF6] rounded-xl p-5 shadow-sm">
                      <h3 className="text-sm font-black text-[#26215C] uppercase tracking-wider mb-4 flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                        Live Conflict Detector
                      </h3>
                      <div className="space-y-3">
                        {(() => {
                          const conflicts: string[] = [];
                          calendarEvents.forEach(evt => {
                            const dateStr = evt.start.split('T')[0];
                            const matchingAllocations = autopilotSchedule.find(d => d.date === dateStr);
                            if (matchingAllocations && matchingAllocations.tasks.length > 0) {
                              conflicts.push(`overlap on ${dateStr}: '${evt.summary}' clashes with allocated task slots`);
                            }
                          });

                          if (conflicts.length > 0) {
                            return (
                              <div className="space-y-2.5">
                                {conflicts.slice(0, 3).map((c, i) => (
                                  <div key={`con_${i}`} className="p-3 bg-amber-50 border border-amber-200 text-[#993C1D] text-xs font-bold rounded-xl flex gap-2 items-start">
                                    <AlertTriangle className="w-4 h-4 text-[#993C1D] shrink-0 mt-0.5" />
                                    <span>{c}</span>
                                  </div>
                                ))}
                                <p className="text-[10px] text-[#534AB7] font-semibold italic mt-2">
                                  LifeSaver AI coach has recalculated schedules to fit around these blocks where possible.
                                </p>
                              </div>
                            );
                          }

                          return (
                            <div className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs font-bold rounded-xl flex gap-2 items-center">
                              <Check className="w-4 h-4 text-emerald-600" />
                              <span>No scheduling conflicts detected on your agenda!</span>
                            </div>
                          );
                        })()}
                      </div>
                    </div>

                  </div>

                  {/* Right Side: Timeline Agenda */}
                  <div className="md:col-span-7">
                    <div className="bg-white border border-[#CECBF6] rounded-xl p-5 shadow-sm">
                      <h3 className="text-sm font-black text-[#26215C] uppercase tracking-wider mb-4 flex items-center gap-1.5">
                        <CalendarRange className="w-4.5 h-4.5 text-[#7F77DD]" />
                        Imported Agenda Slots
                      </h3>

                      {isFetchingCalendar ? (
                        <div className="p-8 flex flex-col items-center justify-center gap-3">
                          <RefreshCw className="w-6 h-6 text-[#7F77DD] animate-spin" />
                          <span className="text-xs font-bold text-[#534AB7]">Fetching Google Calendar events...</span>
                        </div>
                      ) : calendarError ? (
                        <p className="text-xs text-rose-500 font-bold p-4 bg-rose-50 border border-rose-200 rounded-xl">{calendarError}</p>
                      ) : calendarEvents.length === 0 ? (
                        <p className="text-xs text-[#888780] font-semibold text-center p-8">No upcoming events found on your primary calendar.</p>
                      ) : (
                        <div className="space-y-3">
                          {calendarEvents.slice(0, 6).map(evt => {
                            const dateObj = new Date(evt.start);
                            const displayDate = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                            const displayTime = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

                            return (
                              <div key={evt.id} className="p-3.5 bg-[#F5F3FF] border border-[#CECBF6]/60 rounded-xl flex justify-between items-center gap-4">
                                <div>
                                  <h4 className="text-xs font-black text-[#26215C]">{evt.summary}</h4>
                                  <span className="text-[10px] text-[#534AB7] font-semibold mt-0.5 block">{displayTime !== "12:00 AM" ? `${displayDate}, ${displayTime}` : displayDate}</span>
                                </div>
                                <span className="bg-[#EEEDFE] border border-[#CECBF6] px-3 py-1 rounded-lg text-[9px] font-black text-[#534AB7] uppercase">Busy slot</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                </div>
              ) : (
                <div className="bg-[#EEEDFE]/30 border border-dashed border-[#CECBF6] rounded-xl p-12 text-center flex flex-col items-center justify-center gap-3">
                  <CalendarDays className="w-10 h-10 text-[#CECBF6]" />
                  <h4 className="text-sm font-extrabold text-[#26215C]">Calendar sync is disabled</h4>
                  <p className="text-xs text-[#534AB7] font-semibold max-w-sm">Connect Google Calendar above to see upcoming events, check timeline clashes, and export schedules automatically.</p>
                </div>
              )}

            </div>
          )}

          {/* Draft Helper Box Widget Area (Behavior 7) */}

        </section>

        {/* 6. RIGHT SIDEBAR: Coach Chat Sidebar (fixed 320px wide, always visible) */}
        <CoachSidebar 
          messages={messages}
          inputMessage={inputMessage}
          setInputMessage={setInputMessage}
          isSending={isSending}
          handleSendMessage={handleSendMessage}
          handlePanicMode={handlePanicMode}
          isPanicLoading={isPanicLoading}
          handleVoiceDump={handleVoiceDump}
          isRecordingVoice={isRecordingVoice}
          isProcessingVoice={isProcessingVoice}
        />

      </main>

      {/* Floating Add Task Modal Form Panel */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-[#26215C]/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in" id="add-task-modal">
          <div className="bg-white border border-[#CECBF6] w-full max-w-md rounded-2xl p-6 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#EEEDFE] rounded-full pointer-events-none blur-3xl"></div>
            
            <div className="flex items-center justify-between mb-4 border-b border-[#CECBF6]/40 pb-3">
              <div>
                <h3 className="text-base font-black text-[#26215C] flex items-center gap-2">
                  <Plus className="w-5 h-5 text-[#7F77DD] stroke-[2.8]" />
                  Schedule New Target
                </h3>
                <span className="text-[10px] text-[#888780] font-bold uppercase tracking-wider block mt-0.5">
                  Single-screen smart planner
                </span>
              </div>
              <button 
                onClick={() => setIsAddModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-[#EEEDFE] border border-transparent hover:border-[#CECBF6] text-[#888780] hover:text-[#26215C] transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {validationState.type === 'idle' ? (
              <form onSubmit={handleCreateTask} className="space-y-4">
                <div className="space-y-4 animate-fade-in">
                  {/* 1. Title */}
                  <div>
                    <label className="block text-[10px] uppercase tracking-wider text-[#534AB7] font-black mb-1.5">Task Title</label>
                    <input 
                      type="text"
                      required
                      autoFocus
                      placeholder="e.g. chemistry final thesis report"
                      value={newTask.name}
                      onChange={(e) => setNewTask({ ...newTask, name: e.target.value })}
                      className="w-full bg-[#F5F3FF] border border-[#CECBF6] focus:border-[#7F77DD] focus:bg-white rounded-xl px-4 py-3 text-sm font-semibold focus:outline-none text-[#26215C]"
                    />
                  </div>

                  {/* 2. Deadline inputs */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] uppercase tracking-wider text-[#534AB7] font-black mb-1.5">Deadline Date</label>
                      <input 
                        type="date"
                        min={getTodayDateString()}
                        value={newTask.deadlineDate}
                        onChange={(e) => setNewTask({ ...newTask, deadlineDate: e.target.value })}
                        className="w-full bg-[#F5F3FF] border border-[#CECBF6] focus:border-[#7F77DD] focus:bg-white rounded-xl px-3 py-3 text-xs focus:outline-none text-[#26215C] font-mono font-bold cursor-pointer"
                      />
                      <span className="text-[9px] text-[#888780] block mt-1 font-semibold leading-tight">
                        💡 Leave blank for today
                      </span>
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase tracking-wider text-[#534AB7] font-black mb-1.5">Deadline Time</label>
                      <input 
                        type="time"
                        value={newTask.deadlineTime}
                        onChange={(e) => setNewTask({ ...newTask, deadlineTime: e.target.value })}
                        className="w-full bg-[#F5F3FF] border border-[#CECBF6] focus:border-[#7F77DD] focus:bg-white rounded-xl px-3 py-3 text-xs focus:outline-none text-[#26215C] font-mono font-bold cursor-pointer"
                      />
                      <span className="text-[9px] text-[#888780] block mt-1 font-semibold leading-tight">
                        ⏰ Default: 5:00 PM
                      </span>
                    </div>
                  </div>

                  {isDeadlineInPast() && (
                    <div className="bg-rose-50 border border-rose-100 text-rose-700 text-xs font-bold p-3 rounded-xl flex items-start gap-2.5">
                      <AlertTriangle className="w-4.5 h-4.5 text-rose-500 shrink-0 mt-0.5" />
                      <span>This deadline has already passed. Please choose a future date and time.</span>
                    </div>
                  )}

                  {/* 3. Effort block */}
                  <div>
                    <label className="block text-[10px] uppercase tracking-wider text-[#534AB7] font-black mb-1.5">Total hours needed</label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setNewTask(prev => ({ ...prev, estimatedEffort: Math.max(0.5, prev.estimatedEffort - 0.5) }))}
                        className="w-11 h-11 border border-[#CECBF6] rounded-xl flex items-center justify-center font-extrabold text-[#534AB7] hover:bg-[#EEEDFE] active:scale-95 transition cursor-pointer select-none bg-white shadow-2xs"
                      >
                        -
                      </button>
                      <input 
                        type="number"
                        required
                        step="0.5"
                        min="0.5"
                        value={newTask.estimatedEffort}
                        onChange={(e) => setNewTask({ ...newTask, estimatedEffort: Math.max(0.5, Number(e.target.value)) })}
                        className="flex-1 text-center bg-[#F5F3FF] border border-[#CECBF6] focus:border-[#7F77DD] focus:bg-white rounded-xl py-3 text-sm font-black focus:outline-none text-[#26215C]"
                      />
                      <button
                        type="button"
                        onClick={() => setNewTask(prev => ({ ...prev, estimatedEffort: prev.estimatedEffort + 0.5 }))}
                        className="w-11 h-11 border border-[#CECBF6] rounded-xl flex items-center justify-center font-extrabold text-[#534AB7] hover:bg-[#EEEDFE] active:scale-95 transition cursor-pointer select-none bg-white shadow-2xs"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {/* 4. Category */}
                  <div>
                    <label className="block text-[10px] uppercase tracking-wider text-[#534AB7] font-black mb-1.5">Category</label>
                    <div className="flex gap-2">
                      {(['study', 'work', 'personal'] as const).map((cat) => {
                        const isSelected = newTask.category === cat;
                        const label = cat === 'study' ? 'Study 📖' : cat === 'work' ? 'Work 💼' : 'Personal 🏠';
                        return (
                          <button
                            type="button"
                            key={cat}
                            onClick={() => setNewTask({ ...newTask, category: cat })}
                            className={`flex-1 py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                              isSelected 
                                ? 'bg-[#7F77DD] text-white border-[#7F77DD] shadow-md shadow-[#7F77DD]/20' 
                                : 'bg-[#F5F3FF] text-[#534AB7] border-[#CECBF6] hover:bg-[#EEEDFE]'
                            }`}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Submit / Cancel Buttons */}
                  <div className="flex gap-3 pt-4 border-t border-[#CECBF6]/40">
                    <button
                      type="button"
                      onClick={() => setIsAddModalOpen(false)}
                      className="flex-1 py-3.5 rounded-xl border border-[#CECBF6] bg-white hover:bg-[#EEEDFE] text-[#534AB7] font-bold text-xs uppercase cursor-pointer transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!newTask.name.trim() || isDeadlineInPast()}
                      className="flex-[2] py-3.5 rounded-xl bg-[#7F77DD] hover:bg-[#6b62ce] disabled:opacity-50 text-white font-black text-xs uppercase tracking-widest shadow-md shadow-[#7F77DD]/25 transition cursor-pointer"
                    >
                      Create & Plan ⚡
                    </button>
                  </div>
                </div>
              </form>
            ) : validationState.type === 'loading' ? (
              <div className="py-12 flex flex-col items-center justify-center text-center space-y-4 animate-fade-in">
                <div className="relative">
                  <div className="w-12 h-12 rounded-full border-4 border-[#EEEDFE] border-t-[#7F77DD] animate-spin"></div>
                  <Sparkles className="w-5 h-5 text-[#7F77DD] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-[#26215C]">Evaluating Plan Quality</h4>
                  <p className="text-[11px] text-[#888780] max-w-xs mt-1 leading-relaxed">
                    AI Coach is validating details, spelling, and clarity of your new objective...
                  </p>
                </div>
              </div>
            ) : validationState.type === 'spelling' ? (
              <div className="space-y-4 py-2 animate-fade-in text-[#26215C]">
                <div className="bg-[#EEEDFE]/50 border border-[#CECBF6] rounded-2xl p-4 flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#7F77DD] flex items-center justify-center text-white shrink-0 mt-0.5 font-bold text-xs">✍️</div>
                  <div className="space-y-1">
                    <h4 className="text-xs font-black uppercase tracking-wider text-[#534AB7]">Spelling Suggestion</h4>
                    <p className="text-xs text-[#888780]">We detected a minor spelling discrepancy. Did you mean:</p>
                    <p className="text-sm font-extrabold text-[#26215C] bg-white border border-[#CECBF6]/60 rounded-xl p-2.5 mt-2 shadow-xs italic">
                      "{validationState.correctedName}"
                    </p>
                  </div>
                </div>
                
                <div className="flex gap-3 pt-3">
                  <button
                    type="button"
                    onClick={() => proceedWithTaskCreation(validationState.originalName)}
                    className="flex-1 py-3.5 rounded-xl border border-[#CECBF6] bg-white hover:bg-[#EEEDFE] text-[#534AB7] font-bold text-xs uppercase cursor-pointer transition"
                  >
                    Keep original
                  </button>
                  <button
                    type="button"
                    onClick={() => proceedWithTaskCreation(validationState.correctedName!)}
                    className="flex-[2] py-3.5 rounded-xl bg-[#7F77DD] hover:bg-[#6b62ce] text-white font-black text-xs uppercase tracking-wider shadow-md shadow-[#7F77DD]/25 transition cursor-pointer"
                  >
                    Accept Correction ✨
                  </button>
                </div>
              </div>
            ) : validationState.type === 'vague' ? (
              <div className="space-y-4 py-2 animate-fade-in text-[#26215C]">
                <div className="bg-[#FFFCEB] border border-[#FBE5C1] rounded-2xl p-4 flex gap-3 text-[#26215C]">
                  <div className="w-8 h-8 rounded-full bg-[#EAB308] flex items-center justify-center text-white shrink-0 mt-0.5 font-bold text-xs">🤔</div>
                  <div className="space-y-1">
                    <h4 className="text-xs font-black uppercase tracking-wider text-[#CA8A04]">Clarify Your Task</h4>
                    <p className="text-xs text-[#713F12]">To help the coach plan this task optimally, could you be more specific?</p>
                    <p className="text-sm font-extrabold text-[#713F12] mt-2 italic">
                      "{validationState.suggestedQuestion}"
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-[#534AB7] font-black mb-1.5">Your Response / Details</label>
                  <input 
                    type="text"
                    placeholder="e.g. for Python lab, or React portfolio project"
                    value={validationState.vagueResponse || ''}
                    onChange={(e) => setValidationState(prev => ({ ...prev, vagueResponse: e.target.value }))}
                    className="w-full bg-[#F5F3FF] border border-[#CECBF6] focus:border-[#7F77DD] focus:bg-white rounded-xl px-4 py-3 text-sm font-semibold focus:outline-none text-[#26215C]"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (validationState.vagueResponse || '').trim()) {
                        const finalName = `${validationState.originalName} (${validationState.vagueResponse!.trim()})`;
                        proceedWithTaskCreation(finalName);
                      }
                    }}
                  />
                </div>
                
                <div className="flex gap-3 pt-3">
                  <button
                    type="button"
                    onClick={() => proceedWithTaskCreation(validationState.originalName)}
                    className="flex-1 py-3.5 rounded-xl border border-[#CECBF6] bg-white hover:bg-[#EEEDFE] text-[#534AB7] font-bold text-xs uppercase cursor-pointer transition"
                  >
                    Skip details
                  </button>
                  <button
                    type="button"
                    disabled={!(validationState.vagueResponse || '').trim()}
                    onClick={() => {
                      const finalName = `${validationState.originalName} (${validationState.vagueResponse!.trim()})`;
                      proceedWithTaskCreation(finalName);
                    }}
                    className="flex-[2] py-3.5 rounded-xl bg-[#7F77DD] hover:bg-[#6b62ce] disabled:opacity-50 text-white font-black text-xs uppercase tracking-wider shadow-md shadow-[#7F77DD]/25 transition cursor-pointer"
                  >
                    Add Details & Save 🚀
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4 py-2 animate-fade-in text-[#26215C]">
                <div className="bg-rose-50 border border-rose-100 rounded-2xl p-4 flex gap-3 text-rose-800">
                  <AlertTriangle className="w-8 h-8 text-rose-500 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h4 className="text-xs font-black uppercase tracking-wider text-rose-600">Unclear Objective</h4>
                    <p className="text-xs text-rose-700">This task name does not appear to contain an understandable academic, work, or personal objective.</p>
                    <p className="text-sm font-extrabold text-rose-900 bg-white border border-rose-100 rounded-xl p-2.5 mt-2 italic">
                      "{validationState.originalName}"
                    </p>
                  </div>
                </div>

                <div className="flex gap-3 pt-3">
                  <button
                    type="button"
                    onClick={() => setValidationState({ type: 'idle', originalName: '' })}
                    className="flex-1 py-3.5 rounded-xl border border-[#CECBF6] bg-white hover:bg-[#EEEDFE] text-[#534AB7] font-bold text-xs uppercase cursor-pointer transition"
                  >
                    Edit Title
                  </button>
                  <button
                    type="button"
                    onClick={() => proceedWithTaskCreation(validationState.originalName)}
                    className="flex-[2] py-3.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs uppercase tracking-wider shadow-md shadow-rose-600/25 transition cursor-pointer"
                  >
                    Add Anyway ⚠️
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modern Status Footer */}
      <footer className="mt-16 py-8 text-center px-4" id="brand-footer">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between text-[11px] font-semibold text-[#888780]">
          <p>© 2026 LifeSaver AI. Beating deadlines, side-by-side with you.</p>
          <div className="flex gap-4 mt-1.5 md:mt-0 font-mono">
            <span>API: <strong className="text-[#534AB7]">Gemini Active</strong></span>
            <span>Database: <strong className="text-[#534AB7]">Cloud Firestore</strong></span>
            <span>ID: <strong className="text-[#534AB7] uppercase">{userId}</strong></span>
          </div>
        </div>
      </footer>

      {/* 2. Voice Dump Preview Modal */}
      {showVoicePreviewModal && (
        <div className="fixed inset-0 bg-[#26215C]/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white border border-[#CECBF6] w-full max-w-lg rounded-xl p-6 shadow-2xl relative overflow-hidden text-[#26215C]">
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#E1F5EE] rounded-full pointer-events-none blur-3xl"></div>
            
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-extrabold text-[#26215C] flex items-center gap-2">
                <Brain className="w-5 h-5 text-[#0F6E56]" />
                Voice Extraction Preview
              </h3>
              <button 
                onClick={() => setShowVoicePreviewModal(false)}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-[#E1F5EE]/40 border border-[#A3E2CD] p-3 rounded-lg text-xs text-[#0F6E56] font-semibold mb-4 text-center">
              🎙️ Coach found {voiceExtractedTasks.length} {voiceExtractedTasks.length === 1 ? 'task' : 'tasks'} — confirm to add?
            </div>

            <div className="space-y-3 max-h-60 overflow-y-auto mb-5 pr-1">
              {voiceExtractedTasks.map((t, idx) => (
                <div key={idx} className="p-3 bg-[#F5F3FF] border border-[#CECBF6] rounded-xl text-xs flex flex-col gap-1.5">
                  <div className="flex justify-between items-start gap-2">
                    <span className="font-extrabold text-[#26215C] break-all">{t.taskName}</span>
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-rose-50 text-rose-800 border border-rose-200">{t.priority}</span>
                  </div>
                  <div className="flex gap-4 text-[#534AB7] text-[10px] font-bold">
                    <span>📅 Due: {t.deadline ? new Date(t.deadline).toLocaleDateString() : 'N/A'}</span>
                    <span>⏱️ Effort: {t.estimatedHours}h</span>
                    <span>🏷️ Category: {t.category}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowVoicePreviewModal(false)}
                className="flex-1 py-3.5 rounded-xl border border-[#CECBF6] bg-white hover:bg-[#F5F3FF] text-[#534AB7] font-black text-xs uppercase cursor-pointer transition"
              >
                Cancel
              </button>
              <button
                onClick={confirmAddVoiceTasks}
                className="flex-1 py-3.5 rounded-xl bg-[#0F6E56] hover:bg-[#0c5c48] text-white font-black text-xs uppercase cursor-pointer transition shadow-md"
              >
                Confirm & Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Panic Mode Triage Overlay */}
      {showPanicOverlay && panicPlan && (
        <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fade-in overflow-y-auto">
          <div className="w-full max-w-2xl bg-slate-900 border border-red-500/30 rounded-2xl p-6 md:p-8 shadow-2xl relative text-white">
            <div className="absolute top-0 right-0 w-64 h-64 bg-red-600/10 rounded-full blur-3xl pointer-events-none"></div>
            
            <div className="flex items-center justify-between mb-6 border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <AlertOctagon className="w-7 h-7 text-red-500 animate-pulse" />
                <div>
                  <h2 className="text-xl font-extrabold tracking-tight text-red-400">EMERGENCY 2-HOUR TRIAGE ACTIVATED</h2>
                  <p className="text-xs text-slate-400 font-medium">Auto-filtering noise to protect your peace.</p>
                </div>
              </div>
              <button 
                onClick={() => {
                  setShowPanicOverlay(false);
                  setIsFocusModeLocked(false);
                }}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Countdown Box */}
            <div className="bg-red-500/10 border border-red-500/20 p-5 rounded-xl flex flex-col items-center justify-center text-center mb-6">
              <span className="text-[10px] text-red-400 uppercase font-black tracking-widest flex items-center gap-1.5 mb-1">
                <Timer className="w-4 h-4 text-red-400 animate-spin" />
                Ticking Clock
              </span>
              <div className="text-4xl md:text-5xl font-mono font-extrabold text-red-500 tracking-wider">
                {formatPanicTimer(panicTimeLeft)}
              </div>
              <p className="text-xs text-slate-400 mt-1.5 font-medium">The timer is running. Commit to this block, mute your notifications, and breathe.</p>
            </div>

            {/* If Focus Mode is Locked */}
            {isFocusModeLocked ? (
              <div className="space-y-6">
                <div className="border border-green-500/20 bg-green-500/5 p-4 rounded-xl">
                  <span className="text-[10px] text-green-400 font-black uppercase tracking-wider block mb-1">🎯 FOCUS LOCKED SESSION</span>
                  <h3 className="text-lg font-bold text-white mb-2">{panicPlan.targetTask}</h3>
                  <div className="space-y-2.5">
                    {panicPlan.steps.map((step, idx) => (
                      <div key={idx} className="flex items-start gap-3 text-sm">
                        <span className="flex items-center justify-center w-5 h-5 rounded bg-green-500/20 border border-green-500/30 text-green-400 text-xs font-bold shrink-0 mt-0.5">{idx + 1}</span>
                        <p className="text-slate-200 font-medium leading-relaxed">{step}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setIsFocusModeLocked(false)}
                    className="flex-1 py-3 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 font-bold text-xs uppercase cursor-pointer transition"
                  >
                    Adjust Triage
                  </button>
                  <button
                    onClick={() => {
                      setShowPanicOverlay(false);
                      setIsFocusModeLocked(false);
                      alert("Incredible session! You survived the triage. Your stress levels are adjusting!");
                      recalculateSchedule();
                    }}
                    className="flex-1 py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white font-black text-xs uppercase cursor-pointer transition shadow-lg shadow-green-600/20"
                  >
                    Complete & Exit Focus
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {/* 1. Target Task to work on */}
                <div>
                  <span className="text-[10px] text-red-400 font-black uppercase tracking-wider block mb-2">⚡ TARGET TASK NOW</span>
                  <div className="bg-slate-800/80 border border-slate-700 p-4 rounded-xl">
                    <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                      <Activity className="w-5 h-5 text-red-400 animate-pulse" />
                      {panicPlan.targetTask}
                    </h3>
                    <p className="text-xs text-slate-400 mt-1 font-medium">Gemini selected this as the absolute priority to tackle right now.</p>
                  </div>
                </div>

                {/* 2. Steps */}
                <div>
                  <span className="text-[10px] text-red-400 font-black uppercase tracking-wider block mb-2">🛠️ ACTION STEPS FOR NEXT 2 HOURS</span>
                  <div className="space-y-2.5">
                    {panicPlan.steps.map((step, idx) => (
                      <div key={idx} className="flex items-start gap-3 text-sm">
                        <span className="flex items-center justify-center w-5.5 h-5.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 text-xs font-bold shrink-0 mt-0.5">{idx + 1}</span>
                        <p className="text-slate-200 font-medium leading-relaxed">{step}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 3. Postpone */}
                {panicPlan.postpone && panicPlan.postpone.length > 0 && (
                  <div>
                    <span className="text-[10px] text-slate-400 font-black uppercase tracking-wider block mb-2">🛑 SAFELY POSTPONED (IGNORE THESE)</span>
                    <div className="space-y-1.5 opacity-60">
                      {panicPlan.postpone.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-xs text-slate-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
                          <span className="line-through">{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  onClick={() => setIsFocusModeLocked(true)}
                  className="w-full py-4 rounded-xl bg-red-600 hover:bg-red-700 text-white font-black text-sm uppercase tracking-wider transition shadow-lg shadow-red-600/30 cursor-pointer text-center"
                >
                  Start Focus Session (Lock Interface)
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Success Celebration Overlay */}
      {showSuccessCelebration && (
        <div className="fixed inset-0 bg-[#26215C]/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white border border-[#CECBF6] w-full max-w-md rounded-2xl p-6 shadow-2xl relative overflow-hidden text-[#26215C] text-center">
            <div className="absolute -left-6 -bottom-6 w-32 h-32 bg-[#E1F5EE] rounded-full pointer-events-none blur-3xl"></div>
            <div className="absolute -right-6 -top-6 w-32 h-32 bg-[#EEEDFE] rounded-full pointer-events-none blur-3xl"></div>
            
            <div className="w-14 h-14 bg-gradient-to-br from-emerald-400 to-teal-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-500/20">
              <Check className="w-7 h-7 text-white stroke-[3.5]" />
            </div>
            
            <h3 className="text-xl font-black text-[#26215C] mb-1">Excellent Work!</h3>
            <p className="text-sm font-semibold text-emerald-600 mb-4">"You're 1 step closer to your goal!"</p>
            
            <div className="bg-[#F5F3FF] border border-[#CECBF6]/60 p-4 rounded-xl text-xs font-bold text-[#534AB7] mb-5 space-y-1">
              <p className="text-[10px] uppercase font-black tracking-widest text-[#7F77DD]">Completed Target</p>
              <p className="text-[#26215C] text-sm font-black">{showSuccessCelebration.taskName}</p>
              <p className="text-xs text-[#888780] font-semibold mt-1">
                🔥 Streak increased to <strong>{streakCount} days</strong>!
              </p>
            </div>

            <button
              onClick={() => setShowSuccessCelebration(null)}
              className="w-full py-3.5 rounded-xl bg-[#7F77DD] hover:bg-[#6b62ce] text-white font-black text-xs uppercase tracking-widest shadow-md shadow-[#7F77DD]/20 transition cursor-pointer"
            >
              Keep Crushing It
            </button>
          </div>
        </div>
      )}

      {/* 5. First-run Onboarding Modal */}
      {showOnboarding && (
        <div className="fixed inset-0 bg-[#26215C]/50 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white border border-[#CECBF6] w-full max-w-lg rounded-2xl p-6 md:p-8 shadow-2xl relative overflow-hidden text-[#26215C]">
            <div className="absolute top-0 right-0 w-48 h-48 bg-[#EEEDFE] rounded-full pointer-events-none blur-3xl"></div>
            
            {/* Step header */}
            <div className="flex items-center justify-between mb-6 border-b border-[#CECBF6] pb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5.5 h-5.5 text-[#7F77DD] animate-spin" />
                <h3 className="text-lg font-black text-[#26215C]">Welcome to LifeSaver AI</h3>
              </div>
              <span className="text-xs bg-[#EEEDFE] border border-[#CECBF6] text-[#7F77DD] px-2.5 py-1 rounded-full font-black">
                Step {onboardingStep} of 3
              </span>
            </div>

            {/* Steps Rendering */}
            {onboardingStep === 1 && (
              <div className="space-y-5 animate-fade-in">
                <div>
                  <h4 className="text-sm font-extrabold text-[#26215C] mb-1">What's your biggest deadline this week?</h4>
                  <p className="text-xs text-[#534AB7] mb-3">Drop the project name and when it's due so we can protect you first.</p>
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-[#534AB7] font-bold mb-1.5">Deadline Task Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Chemistry final thesis report"
                    value={onboardingTaskName}
                    onChange={(e) => setOnboardingTaskName(e.target.value)}
                    className="w-full bg-[#F5F3FF] border border-[#CECBF6] focus:border-[#7F77DD] focus:bg-white rounded-xl px-4 py-3 text-sm focus:outline-none text-[#26215C] font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-[#534AB7] font-bold mb-1.5">Due Date & Time</label>
                  <input
                    type="datetime-local"
                    required
                    value={onboardingDeadline}
                    onChange={(e) => setOnboardingDeadline(e.target.value)}
                    className="w-full bg-[#F5F3FF] border border-[#CECBF6] focus:border-[#7F77DD] focus:bg-white rounded-xl px-4 py-3 text-sm focus:outline-none text-[#26215C] font-semibold"
                  />
                </div>
                <button
                  onClick={() => {
                    if (!onboardingTaskName.trim()) {
                      alert("Please fill in your task name.");
                    } else {
                      setOnboardingStep(2);
                    }
                  }}
                  className="w-full py-3.5 rounded-xl bg-[#7F77DD] hover:bg-[#6b62ce] text-white font-black text-xs uppercase tracking-widest shadow-md cursor-pointer transition mt-2"
                >
                  Continue
                </button>
              </div>
            )}

            {onboardingStep === 2 && (
              <div className="space-y-5 animate-fade-in">
                <div>
                  <h4 className="text-sm font-extrabold text-[#26215C] mb-1">How many hours do you have free today?</h4>
                  <p className="text-xs text-[#534AB7] mb-3">Be honest. This lets us schedule tasks dynamically without over-allocating you.</p>
                </div>
                <div className="bg-[#F5F3FF] border border-[#CECBF6] p-5 rounded-2xl flex flex-col items-center justify-center text-center">
                  <div className="text-5xl font-mono font-black text-[#7F77DD]">{onboardingFreeHours}h</div>
                  <span className="text-[10px] text-[#534AB7] font-bold uppercase mt-1">Daily Work Capacity</span>
                  <input
                    type="range"
                    min="1"
                    max="12"
                    value={onboardingFreeHours}
                    onChange={(e) => setOnboardingFreeHours(Number(e.target.value))}
                    className="w-full mt-4 h-2 bg-[#CECBF6] rounded-lg appearance-none cursor-pointer accent-[#7F77DD]"
                  />
                  <div className="flex justify-between w-full text-[9px] text-[#888780] font-black mt-2 uppercase">
                    <span>1h (chill)</span>
                    <span>12h (beast mode)</span>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setOnboardingStep(1)}
                    className="flex-1 py-3.5 rounded-xl border border-[#CECBF6] text-[#534AB7] font-black text-xs uppercase cursor-pointer hover:bg-[#F5F3FF]"
                  >
                    Back
                  </button>
                  <button
                    onClick={() => setOnboardingStep(3)}
                    className="flex-1 py-3.5 rounded-xl bg-[#7F77DD] hover:bg-[#6b62ce] text-white font-black text-xs uppercase tracking-wider shadow-md cursor-pointer"
                  >
                    Continue
                  </button>
                </div>
              </div>
            )}

            {onboardingStep === 3 && (
              <div className="space-y-5 animate-fade-in">
                <div>
                  <h4 className="text-sm font-extrabold text-[#26215C] mb-1">What's your work style?</h4>
                  <p className="text-xs text-[#534AB7] mb-3">Choose the vibe that describes you best so your Coach can support your personality.</p>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  <button
                    onClick={() => setOnboardingWorkStyle('bursts')}
                    className={`p-4 rounded-xl border text-left transition cursor-pointer flex flex-col gap-1 ${onboardingWorkStyle === 'bursts' ? 'bg-[#EEEDFE] border-[#7F77DD] ring-2 ring-[#7F77DD]/30' : 'bg-white border-[#CECBF6] hover:bg-[#F5F3FF]/30'}`}
                  >
                    <span className="font-extrabold text-sm text-[#26215C]">I work in bursts 🏃‍♂️</span>
                    <span className="text-[10px] text-[#534AB7] font-semibold">Lots of energy in waves. Needs dynamic buffers to recover.</span>
                  </button>
                  <button
                    onClick={() => setOnboardingWorkStyle('structure')}
                    className={`p-4 rounded-xl border text-left transition cursor-pointer flex flex-col gap-1 ${onboardingWorkStyle === 'structure' ? 'bg-[#EEEDFE] border-[#7F77DD] ring-2 ring-[#7F77DD]/30' : 'bg-white border-[#CECBF6] hover:bg-[#F5F3FF]/30'}`}
                  >
                    <span className="font-extrabold text-sm text-[#26215C]">I need structure 🗺️</span>
                    <span className="text-[10px] text-[#534AB7] font-semibold">Strict schedules, even blocks, clear milestones only.</span>
                  </button>
                  <button
                    onClick={() => setOnboardingWorkStyle('grind')}
                    className={`p-4 rounded-xl border text-left transition cursor-pointer flex flex-col gap-1 ${onboardingWorkStyle === 'grind' ? 'bg-[#EEEDFE] border-[#7F77DD] ring-2 ring-[#7F77DD]/30' : 'bg-white border-[#CECBF6] hover:bg-[#F5F3FF]/30'}`}
                  >
                    <span className="font-extrabold text-sm text-[#26215C]">I panic and grind 🩸</span>
                    <span className="text-[10px] text-[#534AB7] font-semibold">Last-minute adrenaline fuel. Needs hard limits and urgency warnings.</span>
                  </button>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setOnboardingStep(2)}
                    className="flex-1 py-3.5 rounded-xl border border-[#CECBF6] text-[#534AB7] font-black text-xs uppercase cursor-pointer hover:bg-[#F5F3FF]"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleCompleteOnboarding}
                    disabled={isOnboardingSubmitting}
                    className="flex-1 py-3.5 rounded-xl bg-[#7F77DD] hover:bg-[#6b62ce] text-white font-black text-xs uppercase tracking-wider shadow-md disabled:opacity-50 cursor-pointer"
                  >
                    {isOnboardingSubmitting ? "Coach Drafting..." : "Generate My Plan ⚡"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
