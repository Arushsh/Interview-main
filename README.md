# Interview Planner AI

An AI-powered platform to help candidates prepare for interviews by generating tailored interview reports, technical/behavioral questions, and personalized preparation plans.

## Features

- **Resume Analysis**: Extracts key skills and experience from PDF resumes.
- **AI Interview Reports**: Generates detailed technical and behavioral questions based on job descriptions.
- **Skill Gap Identification**: Highlights areas where the candidate needs improvement.
- **Dynamic Preparation Plans**: Provides a 7-day plan to get ready for the big day.
- **Resume Tailoring**: (NEW) Generates an ATS-friendly, tailored resume PDF using AI and Puppeteer.

## Tech Stack

- **Backend**: Node.js, Express, MongoDB (Mongoose)
- **AI Integration**: Google Gemini API (via `@google/genai`)
- **PDF Handling**: `pdf-parse`, `puppeteer`
- **Frontend**: React (Vite)

## Setup

1. **Clone the repo**:
   ```bash
   git clone https://github.com/Arushsh/interview-planner-ai.git
   ```

2. **Backend Setup**:
   - `cd Backend`
   - `npm install`
   - Create a `.env` file with:
     ```
     GOOGLE_GENAI_API_KEY=your_api_key
     MONGO_URI=your_mongodb_uri
     JWT_SECRET=your_jwt_secret
     ```
   - `npm run dev`

3. **Frontend Setup**:
   - `cd Frontend`
   - `npm install`
   - `npm run dev`

## License

ISC
