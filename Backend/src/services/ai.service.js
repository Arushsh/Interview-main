const { GoogleGenAI } = require("@google/genai")
const OpenAI = require("openai").default
const Anthropic = require("@anthropic-ai/sdk")
const Groq = require("groq-sdk").default
const { z } = require("zod")
const { zodToJsonSchema } = require("zod-to-json-schema")
const puppeteer = require("puppeteer")

// ─── Client Initialization ────────────────────────────────────────────────────

const groqClient = process.env.GROQ_API_KEY && process.env.GROQ_API_KEY !== "your_groq_api_key_here"
    ? new Groq({ apiKey: process.env.GROQ_API_KEY })
    : null

const geminiClient = process.env.GOOGLE_GENAI_API_KEY
    ? new GoogleGenAI({ apiKey: process.env.GOOGLE_GENAI_API_KEY })
    : null

const openaiClient = process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== "your_openai_api_key_here"
    ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    : null

const anthropicClient = process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== "your_anthropic_api_key_here"
    ? new Anthropic.Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    : null

// ─── Failover AI Caller ───────────────────────────────────────────────────────

/**
 * Attempts to generate a JSON response from available AI providers in order:
 * Gemini -> OpenAI -> Claude
 * 
 * @param {string} prompt - The prompt to send to the AI
 * @returns {Promise<object>} Parsed JSON response from the first successful provider
 */
async function callAiWithFailover(prompt) {
    const providers = [
        { name: "Groq", fn: () => callGroq(prompt) },
        { name: "Gemini", fn: () => callGemini(prompt) },
        { name: "OpenAI", fn: () => callOpenAI(prompt) },
        { name: "Claude", fn: () => callClaude(prompt) },
    ]

    const errors = []

    for (const provider of providers) {
        try {
            console.log(`[AI Service] Attempting with ${provider.name}...`)
            const result = await provider.fn()
            console.log(`[AI Service] Success with ${provider.name}`)
            return result
        } catch (err) {
            console.warn(`[AI Service] ${provider.name} failed: ${err.message}`)
            errors.push(`${provider.name}: ${err.message}`)
        }
    }

    throw new Error(`All AI providers failed:\n${errors.join("\n")}`)
}

// ─── Provider Implementations ─────────────────────────────────────────────────

async function callGroq(prompt) {
    if (!groqClient) throw new Error("Groq client not initialized (missing or placeholder API key)")

    const response = await groqClient.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
            { role: "system", content: "You are a helpful assistant that always responds with valid JSON only. No markdown, no code blocks, no explanations." },
            { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" },
        temperature: 0.7
    })

    return parseJsonResponse(response.choices[0].message.content)
}

async function callGemini(prompt) {
    if (!geminiClient) throw new Error("Gemini client not initialized (missing API key)")

    const result = await geminiClient.models.generateContent({
        model: "gemini-2.0-flash",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { responseMimeType: "application/json" }
    })

    return parseJsonResponse(result.text)
}

async function callOpenAI(prompt) {
    if (!openaiClient) throw new Error("OpenAI client not initialized (missing or placeholder API key)")

    const response = await openaiClient.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
            { role: "system", content: "You are a helpful assistant that always responds with valid JSON only. No markdown, no explanations." },
            { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" },
        temperature: 0.7
    })

    return parseJsonResponse(response.choices[0].message.content)
}

async function callClaude(prompt) {
    if (!anthropicClient) throw new Error("Claude client not initialized (missing or placeholder API key)")

    const response = await anthropicClient.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 8192,
        messages: [
            {
                role: "user",
                content: `${prompt}\n\nIMPORTANT: Respond with ONLY valid JSON. No markdown, no code blocks, no explanations.`
            }
        ]
    })

    return parseJsonResponse(response.content[0].text)
}

// ─── JSON Parser ──────────────────────────────────────────────────────────────

function parseJsonResponse(text) {
    let cleaned = text.trim()

    // Strip markdown code blocks if present
    if (cleaned.startsWith("```")) {
        cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim()
    }

    try {
        return JSON.parse(cleaned)
    } catch (e) {
        throw new Error(`Failed to parse AI response as JSON: ${e.message}`)
    }
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const interviewReportSchema = z.object({
    matchScore: z.number().describe("A score between 0 and 100 indicating how well the candidate's profile matches the job description"),
    technicalQuestions: z.array(z.object({
        question: z.string().describe("The technical question that can be asked in the interview"),
        intention: z.string().describe("The intention of the interviewer behind asking this question"),
        answer: z.string().describe("How to answer this question, what points to cover, what approach to take etc.")
    })).describe("Technical questions that can be asked in the interview along with their intention and how to answer them"),
    behavioralQuestions: z.array(z.object({
        question: z.string().describe("The behavioral question that can be asked in the interview"),
        intention: z.string().describe("The intention of the interviewer behind asking this question"),
        answer: z.string().describe("How to answer this question, what points to cover, what approach to take etc.")
    })).describe("Behavioral questions that can be asked in the interview along with their intention and how to answer them"),
    skillGaps: z.array(z.object({
        skill: z.string().describe("The skill which the candidate is lacking"),
        severity: z.enum(["low", "medium", "high"]).describe("The severity of this skill gap")
    })).describe("List of skill gaps in the candidate's profile along with their severity"),
    preparationPlan: z.array(z.object({
        day: z.number().describe("The day number in the preparation plan, starting from 1"),
        focus: z.string().describe("The main focus of this day in the preparation plan"),
        tasks: z.array(z.string()).describe("List of tasks to be done on this day")
    })).describe("A day-wise preparation plan for the candidate"),
    title: z.string().describe("The title of the job for which the interview report is generated"),
})

// ─── Public Functions ─────────────────────────────────────────────────────────

async function generateInterviewReport({ resume, selfDescription, jobDescription }) {
    const prompt = `
    You are a professional technical interviewer. Generate a detailed interview report in JSON format.
    
    INPUT DATA:
    - Resume: ${resume}
    - Self Description: ${selfDescription}
    - Job Description: ${jobDescription}

    STRICT JSON TEMPLATE (Your response MUST follow this exact structure):
    {
      "title": "A professional job title matching the JD",
      "matchScore": 85,
      "technicalQuestions": [
        {
          "question": "The specific technical question?",
          "intention": "What the interviewer wants to learn about the candidate",
          "answer": "Detailed recommended answer"
        }
      ],
      "behavioralQuestions": [
        {
          "question": "The specific behavioral question?",
          "intention": "The goal of the question",
          "answer": "STAR method approach recommended"
        }
      ],
      "skillGaps": [
        {
          "skill": "Name of the missing skill",
          "severity": "low OR medium OR high"
        }
      ],
      "preparationPlan": [
        {
          "day": 1,
          "focus": "Topic of the day",
          "tasks": ["Task 1", "Task 2"]
        }
      ]
    }

    INSTRUCTIONS:
    - Return ONLY valid JSON.
    - Every item in "technicalQuestions" and "behavioralQuestions" MUST be an object with three keys: question, intention, and answer. 
    - Every item in "skillGaps" MUST be an object with two keys: skill and severity.
    - Every item in "preparationPlan" MUST be an object with three keys: day, focus, and tasks (array).
    - Do not use markdown (no ## or **).
    - Ensure title and matchScore are present.
    `

    return await callAiWithFailover(prompt)
}

async function generatePdfFromHtml(htmlContent) {
    const browser = await puppeteer.launch()
    const page = await browser.newPage()
    await page.setContent(htmlContent, { waitUntil: "networkidle0" })

    const pdfBuffer = await page.pdf({
        format: "A4", margin: {
            top: "20mm",
            bottom: "20mm",
            left: "15mm",
            right: "15mm"
        }
    })

    await browser.close()
    return pdfBuffer
}

async function generateResumePdf({ resume, selfDescription, jobDescription }) {
    const prompt = `Generate a resume for a candidate with the following details:
                        Resume: ${resume}
                        Self Description: ${selfDescription}
                        Job Description: ${jobDescription}

                        Respond with a JSON object with a single field "html" which contains the HTML content of the resume which can be converted to PDF using puppeteer.
                        The resume should be tailored for the given job description and should highlight the candidate's strengths and relevant experience.
                        The HTML content should be well-formatted and structured, making it easy to read and visually appealing.
                        The content should not sound AI-generated and should be as close as possible to a real human-written resume.
                        You can highlight the content using some colors or different font styles but the overall design should be simple and professional.
                        The content should be ATS friendly.
                        The resume should not be so lengthy — ideally 1-2 pages long when converted to PDF.
                        
                        Return ONLY valid JSON in this format:
                        { "html": "<your full HTML here>" }
                    `

    const parsed = await callAiWithFailover(prompt)
    const pdfBuffer = await generatePdfFromHtml(parsed.html)
    return pdfBuffer
}

module.exports = { generateInterviewReport, generateResumePdf }
