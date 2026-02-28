# prototypebot

A simple ChatGPT-like chatbot UI built with HTML, CSS, and JavaScript that connects directly to the OpenAI Chat Completions API from the browser.

---

## Overview

`prototypebot` is a lightweight, client-side chat interface that sends user prompts to the OpenAI API and displays the model’s responses in a clean chat layout. It is designed as a prototype or starting point for building custom AI chat applications.

---

## Features

- Chat-style user interface
- Built with plain HTML, CSS, and JavaScript
- Uses `fetch` to call the OpenAI API
- Displays conversation messages dynamically
- Sidebar message history
- "New Chat" functionality
- Basic rate-limit handling (HTTP 429) with exponential backoff (up to 3 retries)

## Requirements

- An OpenAI API key
- A modern web browser (Chrome, Edge, Firefox, etc.)
- (Recommended) A local static server

---

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/yxngrbree/prototypebot.git
cd prototypebot
```
Open bot.js and replace the placeholder:
```
const API_KEY = "x.x.x.x.x.x";
```
Replace it with your actual OpenAI API key.
