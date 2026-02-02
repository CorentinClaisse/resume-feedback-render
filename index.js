import express from 'express';
import cors from 'cors';
import multer from 'multer';
import dotenv from 'dotenv';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs/promises';

dotenv.config();

const app = express();
const upload = multer({ dest: '/tmp/' });
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

app.use(cors());
app.use(express.json());

// Store resume contexts per session (in production, use Redis/DB)
const sessionStore = new Map();

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

    // Return results with session ID
    res.json({
      ...analysisResult,
      sessionId
    });

  } catch (error) {
    console.error('Analysis error:', error);
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

