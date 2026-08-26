# Automatic Text Summarization Using a Transformer-Based T5 Model
### A Traceable, Personalized PDF-to-Notes Learning Platform

---

## 1. What is this project?

This is an **intelligent academic study platform** that takes a long PDF — a textbook chapter, a full unit, lecture material — and converts it into **structured, hierarchical, and traceable notes**, without the student having to read the entire document first.

The student uploads a PDF (potentially 80+ pages). The system:
1. Extracts the raw content along with its exact position in the document (page number, paragraph, coordinates).
2. Cleans and organizes that content into topics and subtopics.
3. Passes it through a **fine-tuned T5 Transformer model** to generate abstractive summaries — not copy-pasted sentences, but genuinely re-written, concise notes.
4. Builds those into a hierarchy: paragraph summaries → topic notes → page notes → chapter-level revision notes.
5. Keeps a permanent link between every generated note and the exact paragraph it came from.

The result is a **split-screen study workspace**: the original PDF on one side, AI-generated notes on the other, with the two panels wired together — click a note, its source lights up in the PDF; click a paragraph, its note opens on the other side.

---

## 2. Why does this project exist? (The problem statement)

Most "PDF summarizer" or "chat with your PDF" tools share the same weakness: **they ask the student to trust the output blindly.** The model produces a paragraph of text, and the student has no way of knowing:

- Whether the summary is accurate.
- Whether it dropped an important condition, exception, or formula.
- Which exact part of the source material it's even talking about.

For casual reading, that's a tolerable risk. For **academic exam preparation**, it's a serious problem — a missed exception clause or dropped formula condition can directly cost marks. Students are also generally taught (correctly) not to blindly trust AI-generated summaries for exam prep.

This project's central bet is: **summarization is only useful academically if it's verifiable.** So instead of just compressing the PDF, this platform makes every single generated sentence traceable back to its exact origin in the source document. That single design decision is what separates this from a generic "upload and chat" tool — and it's also why the project has real NLP substance: source-grounded generation is a harder, more research-relevant problem than plain summarization.

On top of that verifiability core, the platform layers personalization: it learns *where a specific student* struggles (not a generic average), and turns a static PDF into a living, adaptive study companion.

---

## 3. Core working pipeline (step by step)

### Step 1 — PDF Upload & Extraction
The user uploads a PDF. The system extracts:
- Page numbers
- Headings and subheadings
- Paragraph and sentence boundaries
- Formulas, definitions, and general textual layout
- **Exact bounding-box coordinates** of every text span (this is what later allows pixel-accurate highlighting)

### Step 2 — Document Organization (NLP Preprocessing)
Raw extracted text is messy — broken lines, headers/footers, inconsistent spacing. This stage:
- Cleans and normalizes the text
- Removes noise (page numbers, running headers, artifacts)
- Detects headings to segment the document into topics and subtopics
- Preserves a reference back to the original page/paragraph for every resulting chunk — nothing is processed without keeping its "home address" in the source PDF

### Step 3 — T5-Based Hierarchical Summarization
Rather than feeding an 80-page document into T5 as one giant block (which would blow past the model's input sequence limit and silently drop later content), the system builds summaries **bottom-up**:
- Each paragraph → a micro-summary
- Micro-summaries within a topic → a topic note
- Topic notes within a page → a page note
- Page notes within a chapter → a chapter-level revision note

This hierarchical approach is both a practical necessity (sequence-length limits) and a pedagogical feature — a student can zoom in from "give me the whole chapter" down to "give me just this one paragraph."

### Step 4 — Source Mapping & Highlighting
Every note generated in Step 3 is stored with:
- Page number
- Paragraph ID
- Text-position coordinates

When a student clicks a note, the system looks up these stored coordinates and highlights the *exact* supporting paragraph in yellow inside the original PDF viewer.

### Step 5 — Interactive Study Workspace
The final experience is a resizable split-screen:
- **Left panel:** the original PDF, with highlight overlays
- **Right panel:** notebook-style generated notes, organized topic by topic
- A draggable divider lets the student favor whichever panel they need at the moment

---

## 4. Full feature list — what the student can actually do

| Feature | Description |
|---|---|
| Multi-granularity summaries | Read page-wise, paragraph-wise, topic-wise, or chapter-wise summaries |
| Click-to-source | Click any note → see the exact PDF paragraph it came from, highlighted |
| Reverse lookup | Click a PDF paragraph → the relevant note opens on the notes panel |
| Editable notes | Edit AI-generated notes, add personal annotations, pin key content |
| Personal notebook | Build a personalized revision notebook from pinned/edited content |
| Universal search | Search any keyword, topic, definition, formula, or concept across both the PDF and the notes |
| Note style switching | Toggle between concise revision points, detailed notes, and simplified explanations |
| Export | Export notes offline as PDF or Markdown |
| AI doubt assistant | Groq-powered chat, but answers are grounded in retrieved PDF content with page-level evidence shown — not a free-floating chatbot |

---

## 5. Special / "wow factor" features

### 5.1 Traceable Notes (the central innovation)
Every generated note carries a verifiable link to its source. Example: if the system outputs *"Photosynthesis converts light energy into chemical energy,"* clicking it highlights the exact paragraph that produced that sentence. This is what makes the notes trustworthy enough for exam prep rather than just a convenience summary.

### 5.2 Confusion Heatmap
The system passively learns where a specific student struggles, using signals like:
- Paragraphs reread repeatedly
- Notes clicked multiple times
- Topics where the student asked several doubts
- Manually highlighted sections
- Quiz answers that were wrong
- Topics where time-on-page is unusually high

These signals produce a personal heatmap overlaid on the PDF:
- **Yellow** — mild attention needed
- **Orange** — the student has struggled here
- **Red** — high-priority revision area

Two students reading the identical PDF end up with two different heatmaps — this is what turns a static document into a personalized learning artifact.

### 5.3 Exam Essentials Notebook
An auto-generated, separate notebook that pulls together everything exam-critical from across the whole document:
- Definitions and keywords
- Laws and principles
- Formulas and their conditions
- Units and symbols
- Classifications and rules
- Advantages/disadvantages
- Exceptions and limitations
- Key examples and applications

Instead of hunting through 80 pages the night before an exam, this is a pre-built, organized cheat-sheet.

### 5.4 Topic Transition Cards
After each major topic, a small card explains how it connects to what came before and after — e.g. *"the previous topic introduced supervised learning; this section extends it into classification algorithms; the next section applies this via decision trees."* This preserves the logical flow of a chapter instead of leaving the student with a pile of disconnected notes.

### 5.5 Knowledge Graph with Evidence
The whole document is converted into an interactive concept map — nodes are topics/definitions/methods/formulas/examples, and edges represent relationships ("requires," "explains," "is an example of," "compares with," "uses"). Clicking a node opens its note; clicking an edge reveals the exact PDF paragraph that justifies that relationship. This makes the graph an **explainable navigation tool**, not a decorative mind map.

### 5.6 Viva Simulator
An adaptive oral-exam practice tool built from the generated notes and key concepts:
- Asks an initial question on the selected topic
- Follows up based on the student's actual answer
- Increases difficulty if the student is doing well
- Flags missing keywords or incomplete explanations
- Shows the relevant source paragraph after evaluation
- Scores the student on a rubric: conceptual accuracy, completeness, clarity, use of examples, confidence

---

## 6. Tech stack — and why each piece was chosen

### Frontend: Vite + React (TypeScript) + TailwindCSS
- **Vite + React** — fast dev experience, and React's component model fits a UI with a lot of interlinked, reactive state (click a note → highlight moves in a completely different panel).
- **TailwindCSS** — utility-first styling lets you build the notebook UI, heatmap colors, and split-screen layout quickly without hand-writing CSS files.
- **`react-pdf` (pdf.js)** — renders the PDF and allows overlaying highlight boxes at specific coordinates — this is what makes the "click note → highlight paragraph" feature technically possible.
- **`react-resizable-panels`** — implements the draggable divider between the PDF and notes panels.
- **`react-flow`** — renders the interactive knowledge graph with clickable nodes and edges.
- **Zustand** — lightweight global state management for cross-panel state (active highlight, selected note, current document) without Redux's boilerplate.

### Backend: FastAPI (Python)
- Chosen specifically because the **NLP/ML pipeline is Python-native** (Transformers, PyTorch). Using FastAPI avoids a language boundary between the API and the ML code — no subprocess calls, no separate microservice hop.
- **Async support** matters because summarizing an 80-page PDF is slow (seconds to minutes); FastAPI can handle other requests while a heavy job runs.
- **Pydantic validation** keeps the structured data (page numbers, paragraph IDs, coordinates, confidence scores) consistent between backend and frontend.

### Async job processing: Celery + Redis
PDF processing is not instant — it can't be a blocking request/response call. Celery runs it as a background job; Redis is the message broker. The frontend can poll a status endpoint or receive live updates via WebSockets/Socket.IO ("Extracting pages... Segmenting topics... Summarizing chapter 3 of 6...").

### Database: MongoDB
- Chosen over a relational database because the data here is naturally **nested and variable-shaped** — a note has a variable number of source paragraphs, a knowledge graph node has a variable number of edges, formulas have different structures than definitions. MongoDB's document model fits this without constant schema migrations.
- Also lines up with prior project experience, reducing ramp-up time.
- **MongoDB Atlas** (cloud-hosted, even during local development) is preferred over a local Mongo install, so the exact same connection string works identically once deployed to Render — no "works on my machine" migration surprise later.

### NLP / ML Layer
| Component | Tool | Why |
|---|---|---|
| PDF text extraction | **PyMuPDF (`fitz`)** | Gives exact bounding-box coordinates per text span — essential for pixel-accurate highlighting |
| Preprocessing | **spaCy** | Sentence splitting, cleaning, and rule-based pattern matching to detect definitions, formulas, units |
| Summarization | **Fine-tuned T5 (Hugging Face Transformers + PyTorch)** | Encoder-decoder Transformer that treats summarization as text-to-text generation; T5-small/T5-base chosen over T5-large for realistic inference time without heavy GPU infrastructure |
| Embeddings | **sentence-transformers** | Generates semantic embeddings for search, doubt-assistant retrieval, and confidence scoring — a separate model from T5 since T5 isn't built for embedding similarity |
| Vector search | **ChromaDB / FAISS** | Stores embeddings for fast semantic retrieval across the document |
| Knowledge graph construction | **NetworkX** | Builds the topic/relationship graph server-side, then serializes to JSON for the frontend to render |

### AI Assistant Layer: Groq API
Used strictly for the **conversational** experience — doubt clarification and viva dialogue — not for the core summarization. Retrieval-augmented: relevant chunks are pulled from the vector store and injected into the Groq prompt, keeping answers grounded in the actual PDF rather than the model's general knowledge. This preserves the project boundary: Groq enhances interactivity, but the flagship NLP contribution remains your own T5 pipeline.

### Auth: JWT
Standard JSON Web Token authentication, issued by FastAPI, matching a pattern already used in prior projects.

### Deployment: Render (later), Docker Compose (for containerization)
- Currently building for **localhost** — get the full pipeline working locally first.
- Environment variables (Mongo URI, JWT secret, Groq key) go into a `.env` file from day one, so deploying later is just pasting the same variables into Render's dashboard.
- Docker Compose will eventually containerize FastAPI + Celery worker + Redis together for a one-command demo environment.

---

## 7. Major NLP modules (summary table)

| Module | What it does |
|---|---|
| PDF text extraction | Extracts readable text, page numbers, paragraph boundaries, and coordinate positions |
| Text preprocessing | Cleans text, removes noise, splits sentences, normalizes spacing |
| Topic segmentation | Detects headings, groups related paragraphs into topics/subtopics |
| T5 abstractive summarizer | Generates natural-language summaries rather than copying sentences (abstractive, not extractive) |
| Hierarchical summarizer | Builds paragraph → topic → page → chapter summaries in sequence |
| Source-grounding engine | Maps every note to its originating page, paragraph, and highlight coordinates |
| Key-information extractor | Detects definitions, formulas, laws, conditions, units, examples, exceptions |
| Semantic retrieval | Finds the most relevant passages for search, doubt clarification, and evidence display |
| Quiz & performance analyzer | Generates topic-based questions, analyzes answers to surface weak concepts |

---

## 8. Project boundary — what's "yours" vs. what's "assisted"

- **Flagship NLP layer (your original contribution):** PDF extraction, preprocessing, topic segmentation, T5-based summarization, source mapping, formula/definition extraction, heatmap analytics, knowledge graph construction, evidence highlighting. This runs entirely on your own models, algorithms, and stored data.
- **Optional AI assistant layer:** Groq API powers natural conversational clarification, viva dialogue, and mind-map narration. It is explicitly *not* the core NLP contribution and should never be presented as such in your report or viva.

This separation is what makes the project defensible in a viva: the innovation is an explainable, Transformer-based NLP system, and Groq is only a UX layer on top.

---

## 9. How to build this — suggested implementation order

1. **Set up the skeleton:** Vite+React frontend, FastAPI backend, MongoDB Atlas connection, basic JWT auth — get a "hello world" full-stack flow working end-to-end first.
2. **PDF extraction pipeline:** Upload endpoint → PyMuPDF extraction → store raw text + coordinates in MongoDB. Verify you can retrieve and re-render a PDF with a manually-placed highlight box before touching any ML.
3. **Preprocessing + topic segmentation:** spaCy-based cleaning and heading detection. Confirm chunk boundaries look sensible on a real sample PDF before summarizing anything.
4. **T5 summarization (paragraph level first):** Fine-tune or use a pretrained T5 checkpoint on paragraph-level summarization. Get single-paragraph summaries working and stored with their source reference before building the hierarchy.
5. **Hierarchical roll-up:** Once paragraph summaries work, build topic → page → chapter summarization on top.
6. **Source-mapping + highlight UI:** Wire the frontend's PDF viewer to the stored coordinates — this is the feature most worth demoing early since it's your core differentiator.
7. **Split-screen workspace:** Build the resizable two-panel UI, connect click-to-highlight both directions.
8. **Key-information extractor + Exam Essentials notebook:** Layer in definition/formula/unit detection once the base summarization pipeline is stable.
9. **Semantic search + Groq assistant:** Add embeddings, vector store, and retrieval-grounded chat.
10. **Confusion heatmap:** Requires usage-tracking data, so this comes after the core reading/notes experience is functional and being used.
11. **Knowledge graph:** Build once you have enough extracted concepts/relationships from earlier stages to populate it meaningfully.
12. **Viva Simulator:** Build last — it depends on notes, definitions, and key concepts from nearly every earlier module.
13. **Async processing (Celery + Redis):** Introduce this once the pipeline works synchronously end-to-end on a small test PDF — then wrap it in background jobs so it scales to 80-page documents without blocking requests.
14. **Deployment to Render:** Only after the full local pipeline is stable — containerize with Docker Compose, move environment variables to Render's dashboard, confirm MongoDB Atlas connection works identically in production.

---

## 10. Why this beats a generic "upload PDF and chat with it" app

A standard PDF-chat tool retrieves relevant chunks and asks an LLM to answer a question — the student receives an answer with no structural understanding of the document and no verifiable link back to the source beyond maybe a citation. This project instead:

- Builds a **persistent, structured, hierarchical representation** of the entire document (not just a retrieval index).
- Grounds **every generated note**, not just chat answers, to exact source coordinates.
- Learns and adapts **per student**, not just per document.
- Produces reusable study artifacts (Exam Essentials, knowledge graph, revision notebook) that outlive a single Q&A session.
- Keeps the LLM (Groq) strictly as an assistant layer, while the actual NLP contribution — extraction, segmentation, hierarchical T5 summarization, source grounding — is your own engineered pipeline.