# 🎡 Spin The Wheel – Random Name

A real-time multi-user spin-the-wheel app with **controlled randomization** — admins can pre-set winners for specific spin numbers while all other spins remain truly random.

## ✨ Features

- 🎯 **Controlled Randomization** – Fix the winner for any specific spin number
- 🌐 **Real-time Multi-device** – Supabase Realtime syncs animation to all connected browsers
- 🔐 **Secure** – Supabase Auth + Row Level Security + SECURITY DEFINER RPC
- 👥 **Guest Access** – Share a link; no login required for viewers
- 🎨 **Beautiful Wheel** – HTML5 Canvas, smooth easing, confetti, sound effects
- 📱 **Responsive** – Desktop, tablet, and mobile

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm
- A free [Supabase](https://supabase.com) account

### 1. Clone & Install

```bash
git clone https://github.com/YOUR_USERNAME/spin-the-wheel-random.git
cd spin-the-wheel-random
npm install
```

### 2. Set Up Supabase

1. Go to [supabase.com](https://supabase.com) → **New Project**
2. In your project dashboard → **SQL Editor**, run these migrations **in order**:
   - `supabase/migrations/001_initial_schema.sql`
   - `supabase/migrations/002_rls_policies.sql`
   - `supabase/migrations/003_rpc_functions.sql`
3. In **Database → Replication** → enable Realtime for these tables:
   - `spin_history`
   - `participants`
   - `rooms`

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:
```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Find these values in: Supabase Dashboard → **Settings → API**

### 4. Create Admin Account

1. In Supabase Dashboard → **Authentication → Users** → **Invite User**
   or use the Sign Up form on the app's login page.
2. The first person to sign up is the first Admin.
3. Each Admin manages their own rooms independently.

### 5. Run Locally

```bash
npm run dev
```

Open http://localhost:5173

---

## 📖 Usage Guide

### For Admin

1. **Sign in** at `http://localhost:5173/login`
2. **Create a room** from the Dashboard
3. **Add participants** in the Entries panel (one name per line)
4. **Set fixed rules** in the Rules tab (e.g., Spin #2 → Emma)
5. **Copy the guest link** from the toolbar or room card
6. **Share the link** with participants
7. **Press SPIN** – all guests see the same animation in real-time

### For Guests

- Open the link from Admin
- No login required
- Watch the wheel spin and see results live

### Controlled Randomization

| Spin | Type | Result |
|------|------|--------|
| 1 | Random | Any participant |
| 2 | **Fixed** | Pre-set winner (e.g., Emma) |
| 3–5 | Random | Any participant |
| 6 | **Fixed** | Pre-set winner (e.g., Daniel) |
| 7+ | Random | Any participant |

Set rules in **Rules tab** → select spin number + winner → Add Rule.

---

## 🌍 Deploy to Vercel (Free)

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/spin-the-wheel-random.git
git push -u origin main
```

### 2. Deploy on Vercel

1. Go to [vercel.com](https://vercel.com) → **New Project**
2. Import your GitHub repository
3. In **Environment Variables**, add:
   - `VITE_SUPABASE_URL` = your Supabase URL
   - `VITE_SUPABASE_ANON_KEY` = your Supabase anon key
4. Click **Deploy**

Your app is now live at `https://your-app.vercel.app`

### 3. Configure Supabase Auth Redirect

In Supabase → **Authentication → URL Configuration**:
- **Site URL**: `https://your-app.vercel.app`
- **Redirect URLs**: add `https://your-app.vercel.app/**`

---

## 🏗 Architecture

```
Frontend (Vercel)          Backend (Supabase)
┌─────────────────┐       ┌──────────────────────────┐
│  React + Vite   │──────▶│  PostgreSQL + RLS        │
│  Admin UI       │  REST │  spin_history (results)  │
│  Guest UI       │◀──────│  rooms, participants      │
│  Canvas Wheel   │ WS/RT │  spin_rules              │
└─────────────────┘       └──────────────────────────┘
        │                          │
        │     perform_spin RPC     │
        └─────────────────────────▶│
              (SECURITY DEFINER    │
               atomic transaction) │
                                   ▼
                        Realtime broadcast
                        → All connected browsers
                           animate to same winner
```

### Key Security Properties

- `perform_spin` RPC uses `SELECT FOR UPDATE` — prevents concurrent spin collisions
- `UNIQUE(room_id, spin_number)` on `spin_history` — each spin# has exactly one winner
- `event_id` UUID — idempotency key prevents duplicate recording
- RLS blocks guests from inserting/modifying any data
- Service Role Key never sent to frontend

---

## 📁 Project Structure

```
src/
├── components/
│   ├── wheel/        SpinWheel, WinnerPopup
│   ├── sidebar/      Sidebar, EntriesList, StylesPanel
│   ├── admin/        SpinHistory
│   └── shared/       Toolbar, ConnectionBadge, LoadingSpinner
├── pages/
│   ├── LoginPage.jsx
│   ├── DashboardPage.jsx
│   ├── RoomPage.jsx      (Admin)
│   └── GuestPage.jsx     (Guest, no login)
├── services/
│   ├── roomService.js
│   ├── participantService.js
│   ├── spinService.js
│   └── ruleService.js
├── hooks/            useAuth, useSound
├── contexts/         AuthContext
├── utils/            wheelMath, colors, roomCode
└── supabase/         client.js
supabase/migrations/
├── 001_initial_schema.sql
├── 002_rls_policies.sql
└── 003_rpc_functions.sql
```

---

## ⚠️ Free Tier Limits

| Service | Free Limit |
|---------|-----------|
| Supabase DB | 500 MB storage |
| Supabase Auth | Unlimited users |
| Supabase Realtime | 200 concurrent connections |
| Supabase API | 2 million requests/month |
| Vercel Hobby | 100 GB bandwidth/month |

These limits are more than sufficient for classroom or event use (up to ~100 simultaneous viewers per room).

---

## 🔧 Troubleshooting

**"Room not found"** – Ensure the guest URL uses the correct room code, and the room hasn't been deleted.

**"Authentication required"** – The `perform_spin` RPC requires Admin to be signed in.

**Wheel shows wrong winner** – Check that `supabase_realtime` publication includes `spin_history` table.

**Build fails** – Ensure `.env` has both `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

---

## 📄 License

MIT — Free to use, modify, and deploy.

