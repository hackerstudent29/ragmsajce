# MSAJCE Academic Assistant - RAG Hybrid AI Bot

A production-grade Telegram bot designed for the **Mohamed Sathak A.J. College of Engineering (MSAJCE)**, implementing a multi-stage RAG (Retrieval-Augmented Generation) pipeline for high-accuracy institutional knowledge retrieval.

## 🚀 Architecture
- **Stage 1 (Scraping & Ingestion)**: Extracts content from 30+ official college URLs and structured manual data.
- **Stage 2 (Retriever)**: Hybrid retrieval system combining MongoDB structured entity search with Vector-based semantic search.
- **Stage 3 (Reasoning - NVIDIA)**: Real-time analysis using `llama-3.1-405b-instruct` for planning and fact-checking.
- **Stage 4 (Output Formulation - Gemini)**: High-performance output using `gemini-3-flash-preview` for final user communication.

## 🛠️ Tech Stack
- **Bot Engine**: `telegraf` (Telegraf API framework)
- **Database**: MongoDB (Structured records & Vector Store)
- **State Store**: Upstash Redis (Session and history management)
- **LLM Reasoning**: NVIDIA NIM API
- **LLM Output & Embeddings**: Google Gemini API & OpenRouter (OpenAI v3)

## 📁 System Modules
- `scripts/scraper.js`: Data collection from web sources.
- `scripts/cleaner.js`: Normalization and deduplication.
- `scripts/structurer.js`: Mapping data to atomic records (people, routes, stops).
- `scripts/retriever.js`: Hybrid query logic.
- `scripts/academic_bot.js`: Core Telegram bot service.

## 🔑 Setup
1. Define environment variables in a `.env` file (see `scripts/.env.example`).
2. Run data ingestion pipeline: 
   ```bash
   node scripts/scraper.js
   node scripts/cleaner.js
   node scripts/structurer.js
   node scripts/db_storage.js
   ```
3. Launch the bot:
   ```bash
   node scripts/academic_bot.js
   ```
