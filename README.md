# HR Assistant Chatbot (n8n + Gemini + Pinecone RAG)

An AI chatbot that answers employee HR questions (leave, working hours, salary, benefits)
using the company's HR policy documents. Built with n8n as a rebuild of my internship project.

## Example
> **Employee:** Can I work from home during probation?
> **Bot:** No. Employees on probation are not eligible for Work From Home. WFH (up to 2 days per week) is only available after completing probation and requires manager approval.

> **Employee:** Is there a gym allowance?
> **Bot:** I don't have that information. Please contact HR at hr@lankatech.example or extension 210.

## How it works
The system has **two workflows** that share one Pinecone vector index.

### 1. HR Knowledge Sync – keeps the knowledge base up to date
```
Google Drive folder "HR Policies"
  → Google Drive Trigger (every minute) or manual run
  → search all files in the folder → download (Google Doc → plain text)
  → split into chunks (500 characters, 100 overlap)
  → Gemini embeddings (3072 dimensions)
  → Pinecone index "hr-chatbot", namespace "hr-policy"
```
Each sync **clears the namespace and re-inserts all files** (full re-sync), so edited or deleted
policy text never leaves outdated answers behind.

### 2. HR Assistant – answers questions
```
Chat message
  → AI Agent (Gemini chat model + Simple Memory)
  → tool "hr_policy_search" (Pinecone, top 4 most similar chunks)
  → answer ONLY from the policy, otherwise "contact HR"
```

## Tech stack & versions
| Part | Tool |
|---|---|
| Workflow engine | n8n 1.123.89 (self-hosted, Node.js 22) |
| Chat model | Google Gemini 3.x flash-lite |
| Embeddings | gemini-embedding-001 (3072 dimensions) |
| Vector database | Pinecone (serverless, cosine metric, AWS us-east-1) |
| Knowledge source | Google Drive (Google Docs) |
| Memory | n8n Simple Memory (window: 5 messages) |

## Repository structure
```
workflows/        exported n8n workflows (no secrets – credentials are stored in n8n)
knowledge-base/   sample HR policy of a fictional company "Lanka Tech Solutions"
docs/             use case and notes
```

## How to run locally
1. Install Node.js 22 and n8n: `npm install -g n8n@1.123.89`, then start with `n8n start`
2. Open http://localhost:5678 and import both files from `workflows/`
3. Create credentials in n8n: Google Gemini API key, Google Drive OAuth2, Pinecone API key
4. Create a Pinecone dense index with **3072 dimensions** and **cosine** metric
5. Put the HR policy in a Google Drive folder and run **HR Knowledge Sync** once
6. Open **HR Assistant** and chat

## Lessons learned
- **Gemini 3 tool calling** requires "thought signatures"; n8n 1.114 did not pass them back
  (400 error), so I upgraded n8n to 1.123.89.
- **Gemini 2.5 models** are no longer available to new API projects (404).
- **Pinecone index dimension** must match the embedding model (3072 for gemini-embedding-001).
- **Free-tier rate limits:** Gemini has per-minute and per-day request limits, so the agent's
  Max Iterations is capped at 3 to avoid retry loops.
- **Google OAuth in Testing mode** needs re-login about every 7 days.

## Status
✅ Step 3 – basic chat · ✅ Step 4 – memory · ✅ Step 5 – RAG · ✅ Step 6 – Drive sync + Pinecone
🚧 Next: multilingual (Sinhala/English) system prompt, architecture diagram, v1.0 release