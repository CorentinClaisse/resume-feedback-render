# 🚀 Render.com Deployment Guide - GUARANTEED TO WORK

## 📋 What You'll Need
- GitHub account (you already have)
- Anthropic API key (you already have)
- 15 minutes

---

## 📦 STEP 1: Upload to GitHub (3 minutes)

### Create New Repository

1. **Go to GitHub.com** and sign in
2. Click **"+"** (top right) → **"New repository"**
3. Name: `resume-feedback-render`
4. Make it **Public**
5. **DON'T check any boxes**
6. Click **"Create repository"**

### Upload Files

1. You'll see an empty repo page
2. Click **"uploading an existing file"**
3. **Drag these 3 files** from this folder:
   - `index.js`
   - `package.json`
   - `render.yaml`
4. Click **"Commit changes"**

**Your repo should now have:**
```
resume-feedback-render/
├── index.js
├── package.json
└── render.yaml
```

---

## 🎨 STEP 2: Sign Up for Render (2 minutes)

1. **Go to https://render.com**
2. Click **"Get Started"**
3. Click **"Sign up with GitHub"**
4. Authorize Render
5. You'll be taken to your dashboard

---

## 🚀 STEP 3: Create Web Service (3 minutes)

### Start New Service

1. Click **"New +"** button (top right)
2. Select **"Web Service"**
3. You'll see your GitHub repositories

### Connect Repository

1. Find **"resume-feedback-render"**
2. Click **"Connect"**

### Configure Service

You'll see a form with several fields:

**Name:**
- Type: `resume-feedback-api` (or whatever you want)

**Region:**
- Leave as default (US West or closest to you)

**Branch:**
- Leave as `main`

**Runtime:**
- Should auto-detect as **"Node"** ✅

**Build Command:**
- Should show: `npm install` ✅

**Start Command:**
- Should show: `npm start` ✅

**Instance Type:**
- Select **"Free"** ✅
- This gives you 750 hours/month free!

### IMPORTANT: Add Environment Variable

Before clicking "Create Web Service", scroll down to **"Environment Variables"**

1. Click **"Add Environment Variable"**
2. **Key:** `ANTHROPIC_API_KEY`
3. **Value:** Paste your API key (starts with `sk-ant-api03-...`)
4. Click **"Add"**

### Deploy!

1. Scroll to bottom
2. Click **"Create Web Service"**
3. Render will start deploying!

---

## ⏳ STEP 4: Wait for Deployment (3-5 minutes)

You'll see:

1. **"In Progress"** - Building... (2-3 minutes)
   - Installing dependencies
   - Starting server
2. **"Live"** - Deployed! ✅ (you'll see a green dot)

**While you wait, you'll see logs like:**
```
==> Installing dependencies
==> Building application
==> Starting server
✅ Resume Feedback API running on port 10000
```

---

## ✅ STEP 5: Get Your URL & Test (1 minute)

### Find Your URL

At the top of your service page, you'll see:
```
https://resume-feedback-api-xxxx.onrender.com
```

Copy this URL!

### Test Health Check

1. Add `/api/health` to your URL
2. Visit: `https://YOUR-URL.onrender.com/api/health`

**You should see:**
```json
{
  "status": "ok",
  "timestamp": "2026-01-28T..."
}
```

🎉 **IT WORKS!**

---

## 🔗 STEP 6: Connect to Lovable (2 minutes)

1. Copy your Render URL (like `https://resume-feedback-api-xxxx.onrender.com`)
2. Go to your Lovable project
3. Update the API URL in your frontend code
4. Replace Vercel URL with Render URL

**Your API Endpoints:**
- Health: `https://YOUR-URL.onrender.com/api/health`
- Analyze: `https://YOUR-URL.onrender.com/api/analyze`
- Chat: `https://YOUR-URL.onrender.com/api/chat`

---

## 💡 Important Notes

### Free Tier Details
- ✅ 750 hours/month free (enough for 24/7 running)
- ✅ Sleeps after 15 min of inactivity
- ✅ Wakes up automatically when called (takes ~30 seconds)

### Prevent Sleeping (Optional)
If you want your API to always be instant:
1. Use a service like **UptimeRobot.com** (free)
2. Ping your `/api/health` endpoint every 10 minutes
3. Keeps your API always awake

### Upgrade If Needed
- Free tier is perfect for testing/low traffic
- If you get popular, upgrade to paid ($7/month for always-on)

---

## 🆘 Troubleshooting

### "Deploy Failed"
1. Check **"Logs"** tab
2. Usually means: Missing environment variable
3. Go to **"Environment"** tab
4. Add `ANTHROPIC_API_KEY` if missing
5. Click **"Manual Deploy"** → **"Deploy latest commit"**

### "502 Bad Gateway"
- Wait 30 seconds (API is waking from sleep)
- Try again

### "Build Failed"
1. Check logs for error
2. Make sure all 3 files are in GitHub
3. Click **"Manual Deploy"** → **"Clear build cache & deploy"**

### Still Not Working?
1. Screenshot the error
2. Screenshot the "Logs" tab
3. Send to me

---

## 💰 Costs

- **GitHub:** Free ✅
- **Render:** Free tier (750 hours/month) ✅
- **Anthropic API:** $5 free credit ✅

**Total: $0 to start!**

---

## 🎓 What You Just Built

✅ Professional AI-powered resume analyzer
✅ Running 24/7 on Render's infrastructure
✅ Accessible worldwide via URL
✅ Integrated with Claude AI
✅ Connected to your Lovable frontend

**You now have a real production API! 🚀**

---

## 📊 Next Steps

1. ✅ Test all endpoints work
2. ✅ Update Lovable with new URL
3. ✅ Test resume upload from frontend
4. ✅ Test chat feature
5. 🎉 Launch your app!

---

## 🔄 Making Updates

When you want to update your API:

1. Edit files in GitHub
2. Commit changes
3. Render automatically detects and redeploys!
4. Takes 2-3 minutes

No manual deployment needed - it's automatic! ✨
