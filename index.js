import express from 'express';
import cors from 'cors';
import multer from 'multer';
import dotenv from 'dotenv';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs/promises';
import pg from 'pg';

dotenv.config();

const app = express();
const upload = multer({ dest: '/tmp/' });
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// PostgreSQL connection
const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Test database connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Database connection failed:', err);
  } else {
    console.log('✅ Database connected:', res.rows[0].now);
  }
});

app.use(cors());
app.use(express.json());

// Store resume contexts per session (in production, use Redis/DB)
const sessionStore = new Map();

// Analytics logging function
async function logAnalytics(data) {
  try {
    await pool.query(`
      INSERT INTO analytics (
        session_id, event_type, file_size, file_type, status,
        overall_score, readability_score, clarity_score, formatting_score,
        chat_message_count, error_message, ip_address, user_agent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `, [
      data.sessionId || null,
      data.eventType || 'analysis',
      data.fileSize || null,
      data.fileType || null,
      data.status || 'success',
      data.overallScore || null,
      data.readabilityScore || null,
      data.clarityScore || null,
      data.formattingScore || null,
      data.chatMessageCount || 0,
      data.errorMessage || null,
      data.ipAddress || null,
      data.userAgent || null
    ]);
  } catch (error) {
    console.error('Analytics logging error:', error);
    // Don't fail the request if logging fails
  }
}

// Recruiter persona and evaluation criteria
const RECRUITER_PROMPT = `You are Corentin Claisse, an expert technical recruiter specializing in sales, partnerships, and go-to-market roles in fintech, fraud prevention, and payments. You have 8+ years of experience at companies like Plaid, Riskified, PayPal, Public.com, and Taboola.

YOUR RECRUITING PHILOSOPHY:
- Resumes should be clear, simple, and achievement-focused
- Name and personal information at the top, followed by a brief background section
- For sales roles: Must have clear numbers around quota attainment, deal sizes, and sales cycles
- Every bullet point should follow this structure:
  * ACCOMPLISHED: What you achieved (the outcome or impact)
  * MEASURED BY: How you measured success (metrics, numbers, percentages, dollar amounts)
  * BY DOING: The specific actions, tools, or methods used to achieve it

YOUR EVALUATION CATEGORIES (score 0-100 each):

1. READABILITY (0-100):
- Is the resume easy to scan in 30 seconds?
- Clear hierarchy and section organization
- Appropriate use of white space
- Consistent formatting throughout
- Font choices and sizing
- Not too dense or cluttered

2. CLARITY & IMPACT (0-100):
- Are achievements specific and quantified?
- Does each bullet follow the Accomplished + Measured + By Doing framework?
- Are metrics concrete (%, $, timeframes)?
- Clear value proposition in summary
- Achievements vs. responsibilities
- Industry-specific terminology used correctly

3. FORMATTING (0-100):
- Professional appearance
- ATS-friendly (no tables, text boxes, or graphics)
- Consistent bullet styles
- Proper date formatting
- Clean margins and alignment
- PDF format preferred over DOCX

YOUR TONE:
- Direct but encouraging
- Specific and actionable (not generic)
- Focus on "what's working" before "what needs work"
- Give concrete examples of improvements
- Talk like a peer, not a robot

When analyzing resumes, provide:
1. Scores for each category (0-100)
2. Specific feedback for each category
3. Overall assessment
4. 3-5 concrete, actionable recommendations

Be honest but constructive. If something is great, say so. If something needs work, explain exactly how to fix it.`;

// Parse resume file
async function parseResume(file) {
  const buffer = await fs.readFile(file.path);
  let text = '';

  if (file.mimetype === 'application/pdf') {
    const data = await pdfParse(buffer);
    text = data.text;
  } else if (
    file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    file.mimetype === 'application/msword'
  ) {
    const result = await mammoth.extractRawText({ buffer });
    text = result.value;
  }

  // Cleanup
  await fs.unlink(file.path);
  
  return text;
}

// Analyze resume endpoint
app.post('/api/analyze-resume', upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Parse resume
    const resumeText = await parseResume(req.file);
    
    if (!resumeText || resumeText.trim().length < 50) {
      return res.status(400).json({ error: 'Could not extract text from resume. Please ensure the file is readable.' });
    }

    // Generate session ID
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Call Claude API for analysis
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      temperature: 0.3, // Lower temperature for more consistent scoring
      system: RECRUITER_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Please analyze this resume and provide scores and feedback. Return your response as a JSON object with this exact structure:

{
  "overallScore": <number 0-100>,
  "readability": {
    "score": <number 0-100>,
    "feedback": "<2-3 sentences with specific observations>"
  },
  "clarity": {
    "score": <number 0-100>,
    "feedback": "<2-3 sentences with specific observations>"
  },
  "formatting": {
    "score": <number 0-100>,
    "feedback": "<2-3 sentences with specific observations>"
  },
  "detailedFeedback": "<2-3 sentences overall summary>",
  "recommendations": [
    "<specific actionable recommendation 1>",
    "<specific actionable recommendation 2>",
    "<specific actionable recommendation 3>",
    "<specific actionable recommendation 4>",
    "<specific actionable recommendation 5>"
  ]
}

Resume to analyze:

${resumeText}`
        }
      ]
    });

    // Parse Claude's response
    const responseText = message.content[0].text;
    
    // Extract JSON from response (Claude might include markdown formatting)
    let analysisResult;
    try {
      // Try to find JSON in the response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysisResult = JSON.parse(jsonMatch[0]);
      } else {
        analysisResult = JSON.parse(responseText);
      }
    } catch (parseError) {
      console.error('JSON Parse Error:', parseError);
      console.error('Response:', responseText);
      return res.status(500).json({ error: 'Failed to parse analysis results' });
    }

    // Store resume context for chat
    sessionStore.set(sessionId, {
      resumeText,
      analysis: analysisResult,
      chatHistory: []
    });

    // Calculate overall score if not provided
    if (!analysisResult.overallScore) {
      analysisResult.overallScore = Math.round(
        (analysisResult.readability.score + 
         analysisResult.clarity.score + 
         analysisResult.formatting.score) / 3
      );
    }

    // Log analytics (anonymized)
    await logAnalytics({
      sessionId,
      eventType: 'analysis',
      fileSize: req.file.size,
      fileType: req.file.mimetype.includes('pdf') ? 'PDF' : 'DOCX',
      status: 'success',
      overallScore: analysisResult.overallScore,
      readabilityScore: analysisResult.readability?.score || null,
      clarityScore: analysisResult.clarity?.score || null,
      formattingScore: analysisResult.formatting?.score || null,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    // Return results with session ID
    res.json({
      ...analysisResult,
      sessionId
    });

  } catch (error) {
    console.error('Analysis error:', error);
    
    // Log error analytics
    await logAnalytics({
      sessionId: null,
      eventType: 'error',
      fileSize: req.file?.size || null,
      fileType: req.file?.mimetype || null,
      status: 'error',
      errorMessage: error.message,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });
    
    res.status(500).json({ 
      error: 'Failed to analyze resume',
      details: error.message 
    });
  }
});

// Chat endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { message, sessionId } = req.body;

    if (!message || !sessionId) {
      return res.status(400).json({ error: 'Message and sessionId are required' });
    }

    // Get session context
    const session = sessionStore.get(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found. Please analyze a resume first.' });
    }

    // Build conversation history
    const conversationMessages = [
      {
        role: 'user',
        content: `Context: I just analyzed this resume and got the following feedback:

Resume Text:
${session.resumeText}

Analysis Results:
- Overall Score: ${session.analysis.overallScore}/100
- Readability: ${session.analysis.readability.score}/100 - ${session.analysis.readability.feedback}
- Clarity & Impact: ${session.analysis.clarity.score}/100 - ${session.analysis.clarity.feedback}
- Formatting: ${session.analysis.formatting.score}/100 - ${session.analysis.formatting.feedback}
- Recommendations: ${session.analysis.recommendations.join('; ')}

Now answer my questions about this resume and feedback.`
      }
    ];

    // Add chat history
    session.chatHistory.forEach(msg => {
      conversationMessages.push({ role: 'user', content: msg.user });
      conversationMessages.push({ role: 'assistant', content: msg.assistant });
    });

    // Add current message
    conversationMessages.push({ role: 'user', content: message });

    // Call Claude API
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      temperature: 0.7, // Higher temperature for more natural, conversational responses
      system: RECRUITER_PROMPT + '\n\nYou are now in a chat conversation helping the user understand their resume feedback. Be conversational, helpful, and specific. Reference the resume and analysis directly.',
      messages: conversationMessages
    });

    const assistantMessage = response.content[0].text;

    // Update chat history
    session.chatHistory.push({
      user: message,
      assistant: assistantMessage
    });

    res.json({ message: assistantMessage });

  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ 
      error: 'Failed to process chat message',
      details: error.message 
    });
  }
});

// Admin authentication middleware
function authenticateAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  const adminPassword = process.env.ADMIN_PASSWORD || 'changeme123';
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    if (token === adminPassword) {
      return next();
    }
  }
  
  return res.status(401).json({ error: 'Unauthorized' });
}

// Serve admin dashboard
app.get('/admin', (req, res) => {
  res.sendFile('/admin.html', { root: '.' });
});

// Admin stats API
app.get('/api/admin/stats', authenticateAdmin, async (req, res) => {
  try {
    // Get today's stats
    const todayStats = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'success' THEN 1 END) as successful,
        AVG(overall_score) as avg_score
      FROM analytics
      WHERE DATE(timestamp) = CURRENT_DATE
        AND event_type = 'analysis'
    `);
    
    // Get all-time stats
    const allTimeStats = await pool.query(`
      SELECT COUNT(*) as total
      FROM analytics
      WHERE event_type = 'analysis'
    `);
    
    // Get recent analyses (last 20)
    const recentAnalyses = await pool.query(`
      SELECT 
        timestamp, file_type, file_size, status,
        overall_score, readability_score, clarity_score, formatting_score
      FROM analytics
      WHERE event_type = 'analysis'
      ORDER BY timestamp DESC
      LIMIT 20
    `);
    
    // Get score distribution
    const scoreDistribution = await pool.query(`
      SELECT 
        COUNT(CASE WHEN overall_score >= 80 THEN 1 END) as excellent,
        COUNT(CASE WHEN overall_score >= 60 AND overall_score < 80 THEN 1 END) as good,
        COUNT(CASE WHEN overall_score < 60 THEN 1 END) as needs_work
      FROM analytics
      WHERE event_type = 'analysis'
        AND status = 'success'
    `);
    
    const today = todayStats.rows[0];
    const totalToday = parseInt(today.total) || 0;
    const successful = parseInt(today.successful) || 0;
    const successRate = totalToday > 0 ? Math.round((successful / totalToday) * 100) : 0;
    
    res.json({
      stats: {
        totalToday,
        successRate,
        avgScore: today.avg_score ? Math.round(today.avg_score) : 0,
        totalAllTime: parseInt(allTimeStats.rows[0].total) || 0
      },
      recentAnalyses: recentAnalyses.rows,
      scoreDistribution: scoreDistribution.rows[0]
    });
    
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server (Railway uses PORT environment variable)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Resume Feedback API running on port ${PORT}`);
  console.log(`🏥 Health check: http://localhost:${PORT}/api/health`);
});
