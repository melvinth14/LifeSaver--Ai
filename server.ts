import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Robust JSON parsing utility to handle any markdown wrappers gracefully
function parseGeminiJson(text: string): any {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    const match = cleaned.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (match) {
      cleaned = match[1].trim();
    }
  }
  try {
    return JSON.parse(cleaned);
  } catch (error) {
    console.error('JSON parsing failed for input:', text);
    throw error;
  }
}

// Lazy-load Gemini AI to avoid crashing on startup if the API key is missing
let aiClient: GoogleGenAI | null = null;
function getAiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is required');
    }
    aiClient = new GoogleGenAI({ 
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });
  }
  return aiClient;
}

async function generateContentWithRetry(ai: GoogleGenAI, params: any, maxRetries = 3): Promise<any> {
  let attempt = 0;
  let delay = 1000;
  const modelsToTry = [params.model, 'gemini-3.1-flash-lite', 'gemini-flash-latest'];

  for (const model of modelsToTry) {
    if (!model) continue;
    attempt = 0;
    delay = 1000;
    const currentParams = { ...params, model };

    while (attempt < maxRetries) {
      try {
        console.log(`[LifeSaver AI] Calling Gemini API (model: ${model}, attempt: ${attempt + 1}/${maxRetries})...`);
        const response = await ai.models.generateContent(currentParams);
        return response;
      } catch (error: any) {
        attempt++;
        
        let errorMessage = '';
        try {
          errorMessage = typeof error === 'object' && error !== null 
            ? JSON.stringify(error) 
            : String(error);
        } catch (e) {
          errorMessage = String(error);
        }
        if (error?.message) {
          errorMessage += ' | ' + error.message;
        }

        const isTransient = errorMessage.includes('503') || 
                            errorMessage.includes('UNAVAILABLE') || 
                            errorMessage.includes('ECONNRESET') || 
                            errorMessage.includes('fetch failed') ||
                            errorMessage.includes('demand') ||
                            errorMessage.includes('overloaded') ||
                            errorMessage.includes('429') ||
                            errorMessage.includes('RESOURCE_EXHAUSTED') ||
                            error?.status === 'UNAVAILABLE' ||
                            error?.code === 503 ||
                            error?.code === 429 ||
                            error?.error?.status === 'UNAVAILABLE' ||
                            error?.error?.code === 503 ||
                            error?.error?.code === 429;
        
        console.warn(`[LifeSaver AI] Gemini call failed (attempt ${attempt}):`, errorMessage);
        
        if (isTransient && attempt < maxRetries) {
          console.log(`[LifeSaver AI] Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          delay *= 2;
        } else {
          break; // Break current model's while loop to try next model in fallback list
        }
      }
    }
  }
  
  throw new Error(`Gemini API call failed after multiple retries and fallback models.`);
}

// ==========================================
// LOCAL/CLIENT-SIDE FAILBACK ENGINES FOR GCAL & QUOTAS
// ==========================================

function calculateProgrammaticSchedule(tasks: any[], calendarEvents: any[], currentDateStr: string, workStyle: string = 'bursts') {
  const startDate = new Date(currentDateStr);
  const days: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    days.push(d.toISOString().split('T')[0]);
  }

  // Compute remaining work fraction for today (first day)
  const todayStr = days[0];
  const currentHour = startDate.getHours();
  // Standard work window: 8 AM to 8 PM (12 hours)
  const todayRemainingFraction = Math.max(0, Math.min(1, (20 - currentHour) / 12));

  // Determine daily limit based on workStyle
  let dailyMaxLimit = 8;
  if (workStyle === 'bursts') {
    dailyMaxLimit = 4.5; // Max 3 blocks of 1.5h = 4.5 hours
  }

  // Map of date -> remaining safe hours (out of dailyMaxLimit max, or reduced by calendar commitments)
  const dateAvailableHours: Record<string, number> = {};
  const dateCalendarEvents: Record<string, any[]> = {};
  
  days.forEach(dayStr => {
    // Check calendar commitments for this day
    const dayEvents = (calendarEvents || []).filter(evt => {
      if (!evt.start) return false;
      return evt.start.startsWith(dayStr);
    });
    dateCalendarEvents[dayStr] = dayEvents;

    // Estimate calendar busy hours
    let calendarBusyHours = 0;
    dayEvents.forEach(evt => {
      if (evt.start && evt.end) {
        const start = new Date(evt.start);
        const end = new Date(evt.end);
        const diffMs = end.getTime() - start.getTime();
        const diffHrs = diffMs / (1000 * 60 * 60);
        if (diffHrs > 0 && diffHrs < 24) {
          calendarBusyHours += diffHrs;
        }
      } else {
        calendarBusyHours += 1.5;
      }
    });

    // Today's safe hours are scaled by remaining fraction, others get max limit
    const maxSafe = dayStr === todayStr ? Math.max(1, Math.round(dailyMaxLimit * todayRemainingFraction)) : dailyMaxLimit;
    dateAvailableHours[dayStr] = Math.max(0, maxSafe - calendarBusyHours);
  });

  const schedule: Array<{ date: string; tasks: Array<{ taskId: string; taskName: string; allocatedHours: number; timeSlots?: string[] }> }> = days.map(d => ({
    date: d,
    tasks: []
  }));

  // Filter out tasks that are completed OR overdue!
  const activeTasks = (tasks || [])
    .filter((t: any) => {
      if (t.completed) return false;
      // Stop generating new schedule blocks for overdue tasks (where deadline is in the past)
      if (t.deadline) {
        const deadlineDate = new Date(t.deadline);
        const now = new Date(currentDateStr);
        if (deadlineDate < now) {
          return false; // Exclude overdue tasks from schedule generation
        }
      }
      return true;
    })
    .map((t: any) => {
      return {
        id: t.id,
        name: t.name,
        remainingEffort: Number(t.estimatedEffort || 0),
        deadline: t.deadline,
        priority: t.priority || 'medium',
        availableDays: t.availableDays || [],
        dailyHoursAvailable: t.dailyHoursAvailable !== undefined ? Number(t.dailyHoursAvailable) : 8
      };
    });

  // Sort tasks: High priority first, then closer deadlines
  activeTasks.sort((a, b) => {
    const priorityWeight = { high: 3, medium: 2, low: 1 };
    const pA = priorityWeight[a.priority as 'high' | 'medium' | 'low'] || 2;
    const pB = priorityWeight[b.priority as 'high' | 'medium' | 'low'] || 2;
    if (pA !== pB) return pB - pA;
    return new Date(a.deadline || '2030-01-01').getTime() - new Date(b.deadline || '2030-01-01').getTime();
  });

  const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Keep track of how many slots are taken per day
  const burstSlots = [
    "09:00 AM - 10:30 AM",
    "11:00 AM - 12:30 PM",
    "01:00 PM - 02:30 PM"
  ];

  const structureSlots = [
    "09:00 AM - 10:00 AM",
    "10:00 AM - 11:00 AM",
    "11:00 AM - 12:00 PM",
    "12:00 PM - 01:00 PM",
    "01:00 PM - 02:00 PM",
    "02:00 PM - 03:00 PM",
    "03:00 PM - 04:00 PM",
    "04:00 PM - 05:00 PM",
    "05:00 PM - 06:00 PM"
  ];

  const dateSlotsAllocatedCount: Record<string, number> = {};
  days.forEach(dayStr => {
    dateSlotsAllocatedCount[dayStr] = 0;
  });

  activeTasks.forEach(task => {
    let hoursToAllocate = task.remainingEffort;
    if (hoursToAllocate <= 0) return;

    for (let i = 0; i < 7; i++) {
      if (hoursToAllocate <= 0) break;

      const dayObj = schedule[i];
      const dayStr = dayObj.date;
      const dayDate = new Date(dayStr + 'T12:00:00');
      const dayName = weekdayNames[dayDate.getDay()];

      if (task.availableDays && task.availableDays.length > 0) {
        if (!task.availableDays.includes(dayName)) {
          continue;
        }
      }

      const dayRemainingCapacity = dateAvailableHours[dayStr];
      if (dayRemainingCapacity <= 0) continue;

      let allocation = 0;
      let timeSlotsUsed: string[] = [];

      if (workStyle === 'bursts') {
        const maxPossibleBlocks = 3;
        const currentBlocks = dateSlotsAllocatedCount[dayStr];
        const blocksLeft = maxPossibleBlocks - currentBlocks;

        if (blocksLeft > 0) {
          const blocksNeededForTask = Math.ceil(hoursToAllocate / 1.5);
          const blocksToAllocate = Math.min(blocksNeededForTask, blocksLeft);
          
          if (blocksToAllocate > 0) {
            allocation = blocksToAllocate * 1.5;
            for (let b = 0; b < blocksToAllocate; b++) {
              timeSlotsUsed.push(burstSlots[currentBlocks + b]);
            }
            dateSlotsAllocatedCount[dayStr] += blocksToAllocate;
          }
        }
      } else if (workStyle === 'structure') {
        const maxSlots = 9;
        const currentSlotsUsed = dateSlotsAllocatedCount[dayStr];
        const slotsLeft = maxSlots - currentSlotsUsed;

        if (slotsLeft > 0) {
          const hoursNeeded = Math.ceil(hoursToAllocate);
          const slotsToAllocate = Math.min(hoursNeeded, slotsLeft, task.dailyHoursAvailable || 8);
          
          if (slotsToAllocate > 0) {
            allocation = slotsToAllocate;
            for (let s = 0; s < slotsToAllocate; s++) {
              timeSlotsUsed.push(structureSlots[currentSlotsUsed + s]);
            }
            dateSlotsAllocatedCount[dayStr] += slotsToAllocate;
          }
        }
      } else {
        // Daily Grind / standard
        const taskDailyMax = task.dailyHoursAvailable || 8;
        const allowedTodayMax = dayStr === todayStr ? Math.max(0.5, Math.round(taskDailyMax * todayRemainingFraction * 10) / 10) : taskDailyMax;
        allocation = Math.min(hoursToAllocate, dayRemainingCapacity, allowedTodayMax);
      }

      if (allocation > 0) {
        const finalAlloc = Math.round(allocation * 10) / 10;
        if (finalAlloc > 0) {
          dayObj.tasks.push({
            taskId: task.id,
            taskName: task.name,
            allocatedHours: finalAlloc,
            ...(timeSlotsUsed.length > 0 ? { timeSlots: timeSlotsUsed } : {})
          });
          hoursToAllocate -= finalAlloc;
          dateAvailableHours[dayStr] -= finalAlloc;
        }
      }
    }
  });

  const warnings: string[] = [];
  activeTasks.forEach(task => {
    if (task.remainingEffort > 0 && dateAvailableHours[days[6]] <= 0) {
      warnings.push(`Task "${task.name}" has some hours unallocated due to high workload/schedule constraints.`);
    }

    if (task.deadline) {
      const deadlineDate = new Date(task.deadline);
      const limitDate = new Date(startDate);
      limitDate.setDate(limitDate.getDate() + 7);
      if (deadlineDate < limitDate) {
        const daysToDeadline = Math.max(0, (deadlineDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
        if (task.remainingEffort > (daysToDeadline + 1) * 4) {
          warnings.push(`Deadline for "${task.name}" is coming up fast! Consider scaling down other work.`);
        }
      }
    }
  });

  return { autopilotSchedule: schedule, warnings };
}

function decompressTaskFallback(taskName: string, category: string, estimatedEffort: number) {
  const effort = Number(estimatedEffort) || 3;
  const p1 = Math.round(effort * 0.2 * 10) / 10 || 0.5;
  const p3 = Math.round(effort * 0.3 * 10) / 10 || 1;
  const p2 = Math.round((effort - p1 - p3) * 10) / 10;
  
  return [
    { name: `Analyze requirements for "${taskName}" and outline initial structure`, estimatedEffort: p1 },
    { name: `Core focus: build and develop main components of "${taskName}"`, estimatedEffort: p2 },
    { name: `Polishing, double checking constraints, and final review`, estimatedEffort: p3 }
  ];
}

const app = express();
app.use(express.json());

// Endpoints

// 1. Analyze input, extract tasks, provide stress score, and build schedule (deadline autopilot)
app.post('/api/chat', async (req, res) => {
  try {
    const { messages, currentTasks = [], currentDateTime, currentCalendarEvents = [], goals = [], streakCount = 0, workStyle = 'bursts' } = req.body;
    const ai = getAiClient();

    const systemInstruction = `
You are LifeSaver AI — a proactive, warm, and witty productivity companion helping users beat deadlines, manage stress, and handle high-pressure schedules.

Core behaviors:
- You help users organize tasks, auto-decompress vague/large goals into 3-6 action steps, score stress from 1-10 with a scannable witty description, rearrange schedule day-by-day for the next 7 days, and draft messages to teammates or instructors for extensions.
- Tone: Warm, direct, and slightly witty. Never preachy. Avoid long motivational speeches. Use bullet points and clear headings to make responses highly readable.
- If the user is panicking, show brief support and jump straight into action mode.
- Highlight "danger zones" in the next 7 days and suggest task deferrals or time compression.

Your client has selected the following work style / vibe: "${workStyle}".
You MUST respect this profile when designing their 7-day autopilotSchedule:
- "bursts": The user works in rapid energy bursts. Schedule work in 90-minute blocks (1.5h), with max 3 blocks per day (daily limit 4.5h), leaving generous buffers for recovery. Time slots like "09:00 AM - 10:30 AM", "11:00 AM - 12:30 PM", "01:00 PM - 02:30 PM" are preferred. Make sure to specify the scheduled "timeSlots" inside each daily allocation object.
- "structure": The user needs strict, evenly distributed scheduling. Schedule work in exact 1-hour slots throughout the 9AM-6PM window, matching their daily hours available, and specify the scheduled "timeSlots" (e.g., ["09:00 AM - 10:00 AM", "10:00 AM - 11:00 AM"]) inside each daily task allocation object.
- "grind": The user works in standard high-energy marathon sessions. Schedule standard hours as-is, with strict urgency warnings, up to their daily available hours (max 8h/day). No need to specify specific time slots.

Your task is to:
1. Respond to the user's message/voice dump in character.
2. If the user mentions new tasks or updates existing ones, parse and restructure them.
3. If they describe a large or vague task (e.g., "finish project"), automatically break it into 3-6 micro-steps with time estimates (in hours).
4. Conduct "Deadline Autopilot" on all current tasks (re-calculating the 7-day daily breakdown based on deadlines, logical priorities, and efforts. Flag impossible deadlines. For 7-day schedules, calculate dates starting from the provided user current local time: ${currentDateTime}).
5. Compute a stress score (1-10) with a 1-sentence witty explanation.
6. Check if any tasks are long-overdue or about to be late, and include a lively procrastination nudge (2-3 sentences max).
7. If the user requests help drafting a message, include a short, professional, and honest draft. When generating the extension email, you must automatically calculate a suggested new deadline = task.deadline + 3 days. Format this new deadline as a real date e.g., "June 28, 2026". Never leave "[Insert Date]" or any other placeholder in the generated email draft. The subject line must also include the task name automatically (e.g., "Request for Extension: [Task Name]").

CRITICAL DIRECTIVES FOR AUTOPILOT SCHEDULE AND HOURS:
1. Microsteps are for the task detail card only — they must NEVER appear in the Autopilot schedule.
2. The day cards should show only the top-level task names and the allocated hours on that day (e.g., "sql" with its hours, "javascript" with its hours), NOT individual microstep names like "Set up Dev Environment".
3. Use ONLY the user's set effort (e.g., sql = 2h, javascript = 1h) as the total budget per task — never the microstep sum.
4. Daily scheduling formula:
   - Max safe hours per day is 8h (or 4.5h if bursts).
   - For each task, check if it specifies "availableDays" (Mon, Tue, Wed, Thu, Fri, Sat, Sun) and "dailyHoursAvailable" (number, e.g. 1-8).
   - You MUST ONLY schedule a task's hours on its specified "availableDays".
   - You MUST NOT allocate more than "dailyHoursAvailable" (or 8h if not specified) for a task on any single day.
   - Split the task's remaining estimatedEffort over "days needed" (estimatedEffort / dailyHoursAvailable) adhering to these constraints.
   - Show task name + remaining hours per day, not individual microsteps.
   - VERY IMPORTANT: Automatically schedule tasks around existing calendar commitments (from "currentCalendarEvents"). Do NOT schedule tasks during blocks where the user is busy with a calendar event, or allocate fewer hours if a day is heavily booked.
   - If there is a direct conflict (e.g., calendar event and task deadline/scheduled hours on the same tight day), flag it by adding a friendly conflict warning in the "warnings" array.
5. Recalculate Pressure Index (stress score) using sum of user-set efforts only:
   totalEffort = sum of all active task.estimatedEffort values set by user. Do NOT use the sum of microstep hours.

Return a JSON object matching this TypeScript interface exactly:
{
  "reply": string, // Your chat reply in character (with formatting/markdown if needed, short and punchy)
  "extractedTasks": Array<{
    "id": string, // Generate unique ID if new
    "name": string,
    "deadline": string, // Date + optional Time, e.g. "2026-06-25T17:00:00"
    "estimatedEffort": number, // in hours (always preserve or use user-set effort if updating)
    "priority": "high" | "medium" | "low",
    "category": "study" | "work" | "personal" | "finance",
    "subtasks": Array<{ "id": string, "name": string, "estimatedEffort": number, "completed": boolean }>
  }>, // Any tasks extracted from this message or merged into currentTasks. Specify all active tasks
  "pressureScore": number, // 1-10 (calculated strictly using user-set efforts, NOT sum of microstep hours)
  "pressureExplanation": string, // 1-sentence witty summary
  "procrastinationNudge": string, // Optional witty nudge if there is a pending/about-to-be-late task
  "autopilotSchedule": Array<{
    "date": string, // ISO Date string (YYYY-MM-DD)
    "tasks": Array<{ "taskId": string, "taskName": string, "allocatedHours": number, "timeSlots"?: string[] }>
  }>, // Day-by-day allocation for the next 7 days starting from user date. Must only contain top-level task names, NOT microstep names. Must avoid scheduling during calendar events. Must respect the workStyle constraint and populate "timeSlots" if appropriate.
  "warnings": string[], // Urgent warnings about impossible loads, scheduling conflicts, or calendar clashes
  "emailDraft": {
    "subject": string,
    "to": string,
    "body": string
  } | null // If they asked for a draft or if you proactively suggest one
}
`;

    const userPrompt = `
User Current Date Time: ${currentDateTime}
Current Task List in database: ${JSON.stringify(currentTasks)}
Google Calendar Events: ${JSON.stringify(currentCalendarEvents)}
User Streaks: ${streakCount} consecutive days
User Goals: ${JSON.stringify(goals)}
Chat History and latest message: ${JSON.stringify(messages)}
User Selected Work Style: ${workStyle}

Provide the structured JSON according to the schema in the system instruction. Make sure to return valid JSON with NO backticks or markdown wraps, or wrap in standard JSON if required. Ensure valid JSON format.
`;

    const response = await generateContentWithRetry(ai, {
      model: 'gemini-3.5-flash',
      contents: [
        { role: 'user', parts: [{ text: userPrompt }] }
      ],
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        temperature: 0.3,
      }
    });

    const responseText = response.text || '{}';
    res.json(parseGeminiJson(responseText));
  } catch (error: any) {
    console.error('Error in /api/chat, applying local fallback:', error);
    const { currentTasks = [], currentDateTime, currentCalendarEvents = [], workStyle = 'bursts' } = req.body;
    
    // Calculate programmatic fallback schedule
    const userDate = currentDateTime || "2026-06-23";
    const fallbackSched = calculateProgrammaticSchedule(currentTasks, currentCalendarEvents, userDate, workStyle);
    
    // Calculate fallback pressure score
    const activeTasks = currentTasks.filter((t: any) => !t.completed);
    const totalEffort = activeTasks.reduce((sum: number, t: any) => sum + (Number(t.estimatedEffort) || 0), 0);
    const pressureScore = Math.min(10, Math.max(1, Math.round(totalEffort / 3) + 1));
    const pressureExplanation = `Pressure scored at ${pressureScore}/10 based on ${activeTasks.length} pending tasks with ${totalEffort}h remaining effort.`;
    
    // Construct friendly fallback response
    const fallbackResponse = {
      reply: `Hey there! Our high-powered AI companion is temporarily catching its breath (or we've hit free-tier rate limits), but the LifeSaver Local Engine has successfully updated your autopilot schedule and checked your deadline pressures below! I'm still 100% here to keep you on track.`,
      extractedTasks: currentTasks, // Keep current tasks intact
      pressureScore,
      pressureExplanation,
      procrastinationNudge: activeTasks.length > 0 
        ? `Don't let things pile up! Let's focus on finishing "${activeTasks[0].name}" first.` 
        : "Nice work keeping your board clean! Take a breather.",
      autopilotSchedule: fallbackSched.autopilotSchedule,
      warnings: fallbackSched.warnings,
      emailDraft: null
    };
    
    res.json(fallbackResponse);
  }
});

// 2. Proactive decompressor - takes task name, category, and estimated effort, returns micro-steps conforming to strict budget
app.post('/api/decompress', async (req, res) => {
  try {
    const { taskName, category, estimatedEffort = 3 } = req.body;
    const ai = getAiClient();

    const response = await generateContentWithRetry(ai, {
      model: 'gemini-3.5-flash',
      contents: `Break the task '${taskName}' into 3-5 clear microsteps. The total hours across ALL steps must add up to exactly ${estimatedEffort}h. Return JSON array: [{step: string, hours: number}]`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              step: {
                type: Type.STRING,
                description: 'Concise, action-focused name of the microstep',
              },
              hours: {
                type: Type.NUMBER,
                description: 'The number of hours allocated to this microstep. Must sum up exactly to the total requested.',
              }
            },
            required: ['step', 'hours']
          }
        },
        temperature: 0.2,
      }
    });

    const responseText = response.text || '[]';
    let parsed = parseGeminiJson(responseText);

    // Ensure parsed is an array
    if (!Array.isArray(parsed) && parsed && typeof parsed === 'object') {
      const keys = Object.keys(parsed);
      const arrayKey = keys.find(k => Array.isArray(parsed[k]));
      if (arrayKey) {
        parsed = parsed[arrayKey];
      } else {
        parsed = [parsed];
      }
    }

    if (!Array.isArray(parsed)) {
      parsed = [];
    }
    
    // Map output to expected format of name and estimatedEffort
    const mapped = parsed.map((item: any) => ({
      name: item.step || item.name || 'Unnamed Step',
      estimatedEffort: Number(item.hours !== undefined ? item.hours : (item.estimatedEffort || 1))
    }));

    res.json(mapped);
  } catch (error: any) {
    console.error('Error in /api/decompress, applying local fallback:', error);
    const { taskName, category, estimatedEffort = 3 } = req.body;
    const fallbackSteps = decompressTaskFallback(taskName || 'Task', category || 'work', estimatedEffort);
    res.json(fallbackSteps);
  }
});

// 2.5. Intelligent task validator
app.post('/api/validate-task', async (req, res) => {
  try {
    const { taskName } = req.body;
    if (!taskName || !taskName.trim()) {
      return res.json({
        confidence: 0,
        isMeaningless: true,
        isVeryShort: false,
        suggestedQuestion: "",
        spellingCorrection: ""
      });
    }

    const trimmed = taskName.trim().toLowerCase();
    
    // Quick heuristic for keyboard mash / meaningless strings before calling AI to be fast/safe
    const meaninglessList = ['vvccbb', 'abc123', 'qwerty', 'tasktask', 'random', 'xyz', 'asdfgh', '11111', 'asdf', 'aaaaaaa', '123abc'];
    if (meaninglessList.includes(trimmed)) {
      return res.json({
        confidence: 10,
        isMeaningless: true,
        isVeryShort: false,
        suggestedQuestion: "",
        spellingCorrection: ""
      });
    }

    const ai = getAiClient();
    const systemInstruction = `You are the AI task validator for LifeSaver AI.
Your goal is to inspect a user's task title and determine if it's understandable, vague, misspelled, or completely meaningless.

Examples of understandable/valid task titles (confidence >= 80%):
- "Complete Data Structures Assignment"
- "Study Linear Algebra"
- "Finish Full Stack Development Project"
- "Prepare Interview Presentation"
- "Write Research Paper"
- "Build Login Page"
These are clear and contain sufficient academic, professional, or skill-related context.

Examples of spelling mistakes (should provide corrected text in spellingCorrection):
- "Maths Algera" -> "Maths Algebra"
- "chemestry lab report" -> "Chemistry lab report"

Examples of very short/vague titles (isVeryShort = true, confidence < 80%):
- "Project" -> "What kind of project are you working on?"
- "Assignment" -> "What kind of assignment is this?"
- "Work" -> "What kind of work are you planning to do?"
- "Coding" -> "What programming language or project are you coding?"
- "Study" -> "What subject or exam are you studying for?"

Examples of completely meaningless titles (isMeaningless = true, confidence < 30%):
- "vvccbb"
- "abc123"
- "qwerty"
- "tasktask"
- "random"
- "xyz"
- "asdfgh"
- "11111"
- "aaaaaaa"

Be highly accurate. If you detect meaningless text or keyboard mashing, mark isMeaningless as true.`;

    const response = await generateContentWithRetry(ai, {
      model: 'gemini-3.5-flash',
      contents: `Validate this task title: "${taskName}"`,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            confidence: {
              type: Type.INTEGER,
              description: "Confidence score from 0 to 100 on understanding the task's specific goals. 100 means perfect understanding, < 80 means unclear or meaningless or too vague."
            },
            isMeaningless: {
              type: Type.BOOLEAN,
              description: "True if the task name is random letters, numbers, keyboard mashes, or has absolutely no study/work context (e.g. 'asdfgh', 'vvccbb', '123abc')."
            },
            isVeryShort: {
              type: Type.BOOLEAN,
              description: "True if the task is a single extremely vague word like 'Project', 'Assignment', 'Work', 'Coding', 'Study', 'Task'."
            },
            suggestedQuestion: {
              type: Type.STRING,
              description: "If isVeryShort is true, provide exactly one specific follow-up question. Otherwise empty string."
            },
            spellingCorrection: {
              type: Type.STRING,
              description: "If there is a minor spelling mistake, provide the correct title here. Otherwise, empty string."
            }
          },
          required: ["confidence", "isMeaningless", "isVeryShort", "suggestedQuestion", "spellingCorrection"]
        },
        temperature: 0.1,
      }
    });

    const parsed = parseGeminiJson(response.text || '{}');
    res.json(parsed);
  } catch (error) {
    console.error('Error in /api/validate-task:', error);
    // Safe fallback: assume valid if error to prevent blocking user entirely
    res.json({
      confidence: 90,
      isMeaningless: false,
      isVeryShort: false,
      suggestedQuestion: "",
      spellingCorrection: ""
    });
  }
});

// 3. Autonomous Rescheduling Engine - redistributes remaining hours to keep days under 8 hours
app.post('/api/reschedule', async (req, res) => {
  try {
    const { currentTasks = [], dateRange = [], workStyle = 'bursts' } = req.body;
    const ai = getAiClient();

    const systemInstruction = `
You are LifeSaver AI Coach. Your task is to autonomously redistribute the remaining task effort hours across the available 7-day period to prevent overloading the user.
The available dates are: ${JSON.stringify(dateRange)}
The active/incomplete tasks are: ${JSON.stringify(currentTasks)}
User's Work Style / Vibe: "${workStyle}".

Rules for Rescheduling:
1. Redistribute the remaining estimated hours of the tasks day-by-day.
2. Respect the user's selected workStyle:
   - "bursts": Max 4.5 hours per day, schedule in 90-minute blocks (1.5h) and specify scheduled "timeSlots" inside each daily allocation object.
   - "structure": Strict evenly distributed 1-hour slots, and specify scheduled "timeSlots" inside each daily allocation object.
   - "grind": Standard marathon sessions, max 8h/day, no time slots needed.
3. Keep the allocations realistic based on the task priority and remaining days before deadlines.
4. Provide a warm, witty, and reassuring Coach message explaining how you autonomously shuffled the tasks to protect their mental health and prevent burnout (e.g. "I noticed Friday was looking like an absolute nightmare, so I've automatically redistributed those tasks according to your style. You're completely safe now! Breathe easy.").

CRITICAL DIRECTIVES FOR AUTOPILOT SCHEDULE AND HOURS:
1. Microsteps are for the task detail card only — they must NEVER appear in the Autopilot schedule.
2. The day cards should show only the top-level task names and the allocated hours on that day (e.g., "sql" with its hours, "javascript" with its hours), NOT individual microstep names like "Set up Dev Environment".
3. Use ONLY the user's set effort (e.g., sql = 2h, javascript = 1h) as the total budget per task — never the microstep sum.
4. Daily scheduling formula:
   - Max safe hours per day is 8h (or 4.5h if bursts).
   - For each task, check if it specifies "availableDays" (Mon, Tue, Wed, Thu, Fri, Sat, Sun) and "dailyHoursAvailable" (number, e.g. 1-8).
   - You MUST ONLY schedule a task's hours on its specified "availableDays".
   - You MUST NOT allocate more than "dailyHoursAvailable" (or 8h if not specified) for a task on any single day.
   - Split the task's remaining estimatedEffort over "days needed" (estimatedEffort / dailyHoursAvailable) adhering to these constraints.
   - Show task name + remaining hours per day, not individual microsteps.

Return a JSON object matching this schema exactly:
{
  "autopilotSchedule": Array<{
    "date": string, // YYYY-MM-DD
    "tasks": Array<{ "taskId": string, "taskName": string, "allocatedHours": number, "timeSlots"?: string[] }>
  }>,
  "coachLogMessage": string // The witty Coach explanation
}
`;

    const userPrompt = `Given these tasks and the workStyle "${workStyle}", redistribute hours across ${JSON.stringify(dateRange)} according to the rules. Return valid JSON only.`;

    const response = await generateContentWithRetry(ai, {
      model: 'gemini-3.5-flash',
      contents: [
        { role: 'user', parts: [{ text: userPrompt }] }
      ],
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        temperature: 0.3,
      }
    });

    const responseText = response.text || '{}';
    res.json(parseGeminiJson(responseText));
  } catch (error: any) {
    console.error('Error in /api/reschedule, applying local fallback:', error);
    const { currentTasks = [], dateRange = [], workStyle = 'bursts' } = req.body;
    const userDate = dateRange[0] || "2026-06-23";
    const fallbackSched = calculateProgrammaticSchedule(currentTasks, [], userDate, workStyle);
    res.json({
      autopilotSchedule: fallbackSched.autopilotSchedule,
      coachLogMessage: `Coach: I've redistributed your remaining hours across the next 7 days keeping your daily loads under a safe cap according to your "${workStyle}" style. Take a deep breath, everything is structured!`
    });
  }
});

// Serve frontend build static files in production
app.post('/api/voice-dump', async (req, res) => {
  try {
    const { transcript } = req.body;
    const ai = getAiClient();

    const response = await generateContentWithRetry(ai, {
      model: 'gemini-3.5-flash',
      contents: `Extract tasks from this voice note: '${transcript}'
Return JSON: [{name, deadline, estimatedHours, priority, category}]
If no clear deadline mentioned, set deadline to null.
Return only valid JSON, no explanation.`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              deadline: { type: Type.STRING, description: 'ISO string or YYYY-MM-DD string, or null if not clear' },
              estimatedHours: { type: Type.NUMBER },
              priority: { type: Type.STRING, enum: ['high', 'medium', 'low'] },
              category: { type: Type.STRING, enum: ['study', 'work', 'personal', 'finance'] }
            },
            required: ['name', 'estimatedHours', 'priority', 'category']
          }
        },
        temperature: 0.2,
      }
    });

    const responseText = response.text || '[]';
    const parsed = parseGeminiJson(responseText);
    const tasks = Array.isArray(parsed) ? parsed.map((t: any) => ({
      name: t.name || t.taskName || "Unnamed Task",
      taskName: t.name || t.taskName || "Unnamed Task", // populate both for frontend stability
      deadline: t.deadline || null,
      estimatedHours: t.estimatedHours !== undefined ? Number(t.estimatedHours) : 2,
      priority: t.priority || 'medium',
      category: t.category || 'work'
    })) : [];
    res.json(tasks);
  } catch (error: any) {
    console.error('Error in /api/voice-dump, applying local fallback:', error);
    const { transcript } = req.body;
    const taskName = transcript ? transcript.trim().slice(0, 50) : "New Voice Task";
    const fallbackTasks = [
      {
        name: taskName,
        taskName: taskName,
        deadline: null,
        estimatedHours: 2,
        priority: "medium",
        category: "work"
      }
    ];
    res.json(fallbackTasks);
  }
});

app.post('/api/panic-plan', async (req, res) => {
  try {
    const { hoursUntilDeadline, tasks } = req.body;
    const ai = getAiClient();

    const response = await generateContentWithRetry(ai, {
      model: 'gemini-3.5-flash',
      contents: `I have ${hoursUntilDeadline} hours until my nearest deadline. My tasks are ${JSON.stringify(tasks)}. Create an emergency 2-hour triage plan. Be direct and specific. Return a JSON object with: which single task to work on right now (targetTask), exact steps for the next 2 hours (steps, array of strings), and what to safely postpone (postpone, array of strings).`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            targetTask: { type: Type.STRING },
            steps: { 
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            postpone: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          },
          required: ['targetTask', 'steps', 'postpone']
        },
        temperature: 0.2,
      }
    });

    const responseText = response.text || '{}';
    res.json(parseGeminiJson(responseText));
  } catch (error: any) {
    console.error('Error in /api/panic-plan, applying local fallback:', error);
    const { tasks } = req.body;
    const target = (tasks && tasks.length > 0) ? tasks[0].name : "your closest task";
    res.json({
      targetTask: target,
      steps: [
        "Eliminate all distractions: put phone on Do Not Disturb and close social tabs.",
        "Set a physical timer for 25 minutes (Pomodoro technique).",
        `Work on "${target}" with 100% focus until the timer rings.`,
        "Take a 5-minute breather and then repeat for one more cycle."
      ],
      postpone: (tasks && tasks.length > 1) ? tasks.slice(1).map((t: any) => t.name) : ["Secondary tasks"]
    });
  }
});

app.post('/api/consequences', async (req, res) => {
  try {
    const { taskName, category, priority, deadline } = req.body;
    const ai = getAiClient();

    const response = await generateContentWithRetry(ai, {
      model: 'gemini-3.5-flash',
      contents: `The task '${taskName}' has category '${category}' and priority '${priority}'. The deadline is ${deadline}. In 2-3 sentences, describe the realistic consequences of missing this deadline. Be honest but not catastrophizing.`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            consequences: { type: Type.STRING }
          },
          required: ['consequences']
        },
        temperature: 0.5,
      }
    });

    const responseText = response.text || '{}';
    res.json(parseGeminiJson(responseText));
  } catch (error: any) {
    console.error('Error in /api/consequences, applying local fallback:', error);
    res.json({
      consequences: `If missed, this could cause bottlenecking in subsequent objectives and unnecessary stress. Let's make continuous microstep progress to avoid it!`
    });
  }
});

app.post('/api/onboarding-welcome', async (req, res) => {
  try {
    const { workStyle, taskName, deadline } = req.body;
    const ai = getAiClient();

    const response = await generateContentWithRetry(ai, {
      model: 'gemini-3.5-flash',
      contents: `Draft a personalized, witty welcome message from LifeSaver AI Coach. The user's work style is '${workStyle}'. They have just entered their first task: '${taskName}' due on '${deadline}'. Welcome them, poke fun gently at their style in a highly supportive way, and give them a 1-2 sentence quick advice on how to start.`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            message: { type: Type.STRING }
          },
          required: ['message']
        },
        temperature: 0.7,
      }
    });

    const responseText = response.text || '{}';
    res.json(parseGeminiJson(responseText));
  } catch (error: any) {
    console.error('Error in /api/onboarding-welcome, applying local fallback:', error);
    res.json({
      message: `Welcome to LifeSaver AI! I'm your proactive, warm productivity coach. Together, we will break your large projects into bite-sized microsteps and keep your daily effort under a safe 8-hour load. Let's conquer your first task together!`
    });
  }
});

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
} else {
  // Integrate Vite dev server middleware
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);
}

const port = 3000;
app.listen(port, '0.0.0.0', () => {
  console.log(`[LifeSaver AI] Server is running on port ${port}`);
});
