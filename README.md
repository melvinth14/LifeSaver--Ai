<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/a1501ba9-0952-496f-9cc2-18b45134fe13

## Run Locally

**Prerequisites:**  Node.js
# LifeSaver AI 🔥
### Beating deadlines, side-by-side with you.

> Vibe2Ship 2026 Hackathon Submission — Problem Statement 1: The Last-Minute Life Saver

## 🚀 Live Demo
[Click here to open LifeSaver AI](https://ai.studio/apps/a1501ba9-0952-496f-9cc2-18b45134fe13)

---

## 💡 What It Does
LifeSaver AI is an autonomous AI-powered deadline companion 
that helps students and professionals plan, track, and complete 
tasks before missing them. It uses Google Gemini to validate tasks, 
decompose them into microsteps, generate personalized 7-day schedules, 
monitor stress in real time, and coach the user through every step.

---

## ✨ Key Features

- **3-Step Smart Task Creation** — set task name, deadline, 
  daily hours available, and available days
- **AI Microstep Decomposition** — breaks tasks into 3-6 steps 
  within your exact hour budget
- **7-Day Deadline Autopilot** — schedules tasks across days 
  with time slots based on your work style
- **3 Work Style Profiles** — Productivity Bursts, 
  Hourly Structure, Daily Grind
- **Real-time Pressure Index** — stress score 1-10 
  with autonomous Coach reactions
- **Voice Dump** — speak your tasks, Gemini parses 
  and schedules them automatically
- **Semantic Task Validation** — spelling correction, 
  vague prompt clarification, gibberish detection
- **Panic Mode** — emergency 2-hour triage plan
- **Habit Streaks & Productivity Goals** — daily and weekly targets
- **Smart Insights** — personalized productivity recommendations
- **Google Calendar Integration** — busy block detection 
  avoids schedule conflicts
- **Mark Complete** — instant pressure recalculation 
  and autopilot refresh

---

## 🛠️ Technologies Used

| Technology | Usage |
|---|---|
| Google AI Studio | Built and deployed here |
| Google Gemini API (3.5 Flash) | All AI features |
| Firebase Firestore | Real-time cloud database |
| Google Calendar API | Busy block detection |
| Google OAuth 2.0 | Calendar authentication |
| Web Speech API | Voice dump feature |
| Google Cloud Run | Live deployment |

---

## 🏗️ How It Works

1. User creates a task via the 3-step wizard
2. Gemini validates the task name semantically
3. Autopilot schedules hours across available days
4. Gemini decomposes task into microsteps within the hour budget
5. Coach monitors pressure and reacts autonomously
6. User marks steps complete — schedule recalculates instantly
7. If overloaded — Panic Mode or extension draft is triggered




1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`
