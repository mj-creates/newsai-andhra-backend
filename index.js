const express = require("express");
const cors = require("cors");
const RSSParser = require("rss-parser");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const axios = require("axios");

// Load environment variables from .env file if it exists (useful for local development)
if (fs.existsSync(path.join(__dirname, ".env"))) {
  const envContent = fs.readFileSync(path.join(__dirname, ".env"), "utf8");
  envContent.split("\n").forEach(line => {
    const [key, ...valueParts] = line.split("=");
    if (key && valueParts.length > 0) {
      process.env[key.trim()] = valueParts.join("=").trim();
    }
  });
}

const app = express();
const parser = new RSSParser();

app.use(cors({
  origin: ["https://newsai-andhra.vercel.app", "http://localhost:5173", "http://localhost:5174"]
}));
app.use(express.json());

const USERS_FILE = path.join(__dirname, "users.json");

// Read users list from JSON file database
const readUsers = () => {
  if (!fs.existsSync(USERS_FILE)) {
    return [];
  }
  try {
    const data = fs.readFileSync(USERS_FILE, "utf8");
    return JSON.parse(data || "[]");
  } catch (err) {
    console.error("Error reading users file:", err);
    return [];
  }
};

// Write users list to JSON file database
const writeUsers = (users) => {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf8");
  } catch (err) {
    console.error("Error writing users file:", err);
  }
};

// Secure password hashing helper using SHA-256
const hashPassword = (password, salt) => {
  const hash = crypto.createHmac("sha256", salt);
  hash.update(password);
  return hash.digest("hex");
};

// Random salt generator helper
const generateSalt = () => {
  return crypto.randomBytes(16).toString("hex");
};

// Simulated email transmission stub
const sendWelcomeEmail = (email, name) => {
  console.log(`
==================================================
[EMAIL SERVICE STUB] Triggering Welcome Email
To: ${email}
Subject: Welcome to the News Summarizer App!

Hi ${name},

Welcome to News Summarizer! We are excited to have you on board.
Our AI-powered engine is ready to help you scan the news easily,
giving you crisp, highly readable bullet points.

If you have any questions, feel free to contact our support.

Happy reading!
- The News Summarizer Team
==================================================
  `);
};

// Helper to extract clean title and source from Google News RSS title (e.g. "Headline - Source")
const cleanTitleAndSource = (rawTitle) => {
  const parts = rawTitle.split(" - ");
  if (parts.length > 1) {
    let source = parts.pop().trim();
    const title = parts.join(" - ").trim();
    
    // Normalize source names
    if (/eenadu/i.test(source)) source = "Eenadu";
    else if (/sakshi/i.test(source)) source = "Sakshi";
    else if (/andhrajyoth/i.test(source)) source = "Andhrajyothy";
    
    return { title, source };
  }
  return { title: rawTitle, source: "Telugu News" };
};

// Filter articles by district keyword
const districtKeywords = {
  "guntur": ["guntur", "గుంటూరు", "amaravati", "అమరావతి", "mangalagiri", "మంగళగిరి"],
  "visakhapatnam": ["visakhapatnam", "విశాఖపట్నం", "vizag", "వైజాగ్", "waltair", "వాల్తేరు"],
  "kurnool": ["kurnool", "కర్నూలు", "nandyal", "నంద్యాల"],
  "east godavari": ["east godavari", "తూర్పు గోదావరి", "rajahmundry", "రాజమండ్రి", "kakinada", "కాకినాడ"],
  "west godavari": ["west godavari", "పశ్చిమ గోదావరి", "eluru", "ఏలూరు", "bhimavaram", "భీమవరం"],
  "krishna": ["krishna", "కృష్ణా", "vijayawada", "విజయవాడ", "machilipatnam", "మచిలీపట్నం"],
  "chittoor": ["chittoor", "చిత్తూరు", "tirupati", "తిరుపతి", "srikalahasti", "శ్రీకాళహస్తి"],
  "kadapa": ["kadapa", "కడప", "cuddapah", "proddatur", "ప్రొద్దుటూరు"],
  "anantapur": ["anantapur", "అనంతపురం", "tadipatri", "తాడిపత్రి", "guntakal", "గుంతకల్"],
  "prakasam": ["prakasam", "ప్రకాశం", "ongole", "ఒంగోలు", "markapur", "మార్కాపురం"],
  "srikakulam": ["srikakulam", "శ్రీకాకుళం", "narasannapeta", "నరసన్నపేట"],
  "vizianagaram": ["vizianagaram", "విజయనగరం", "bobbili", "బొబ్బిలి"],
  "nellore": ["nellore", "నెల్లూరు", "kavali", "కావలి", "gudur", "గూడూరు"],
  "bapatla": ["bapatla", "బాపట్ల"],
  "eluru": ["eluru", "ఏలూరు"],
  "kakinada": ["kakinada", "కాకినాడ"],
  "konaseema": ["konaseema", "కోనసీమ", "amalapuram", "అమలాపురం"],
  "nandyal": ["nandyal", "నంద్యాల"],
  "ntr": ["ntr", "ఎన్టీఆర్", "vijayawada", "విజయవాడ"],
  "palnadu": ["palnadu", "పల్నాడు", "narasaraopet", "నరసరావుపేట"],
  "parvathipuram manyam": ["parvathipuram", "పార్వతీపురం", "manyam", "మన్యం"],
  "sri balaji": ["balaji", "బాలాజీ", "tirupati", "తిరుపతి"],
  "sri sathya sai": ["sathya sai", "సత్యసాయి", "puttaparthi", "పుట్టపర్తి"],
  "tirupati": ["tirupati", "తిరుపతి"]
};

const filterByDistrict = (articles, district) => {
  const key = district.toLowerCase();
  const keywords = districtKeywords[key] || [key];
  return articles.filter((a) =>
    keywords.some(
      (kw) =>
        a.title.toLowerCase().includes(kw) ||
        a.description.toLowerCase().includes(kw)
    )
  );
};
// Sign Up Endpoint
app.post("/auth/signup", async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: "All fields are required" });
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: "Please enter a valid email address" });
  }

  // Validate password length
  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters long" });
  }

  try {
    const users = readUsers();
    
    // Check duplicate email
    if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
      return res.status(400).json({ error: "Email is already registered" });
    }

    const salt = generateSalt();
    const hashedPassword = hashPassword(password, salt);

    const newUser = {
      username,
      email: email.toLowerCase(),
      salt,
      password: hashedPassword,
      createdAt: new Date().toISOString()
    };

    users.push(newUser);
    writeUsers(users);

    // Trigger welcome email stub
    sendWelcomeEmail(newUser.email, newUser.username);

    res.status(201).json({
      message: "Registration successful!",
      user: { username: newUser.username, email: newUser.email }
    });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ error: "Registration failed due to a server error." });
  }
});

// Sign In Endpoint
app.post("/auth/signin", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "All fields are required" });
  }

  try {
    const users = readUsers();
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());

    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const hashed = hashPassword(password, user.salt);
    if (hashed !== user.password) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    res.json({
      message: "Login successful!",
      user: { username: user.username, email: user.email }
    });
  } catch (err) {
    console.error("Signin error:", err);
    res.status(500).json({ error: "Login failed due to a server error." });
  }
});

// Simple scraper route to bypass CORS and extract article text
app.post("/scrape", async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: "URL is required" });
  }

  try {
    const response = await axios.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8"
      },
      timeout: 10000
    });

    const html = response.data;
    
    // Extract page title
    const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : "Scraped News Article";

    // Extract text from paragraph tags
    const pMatches = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)];
    let paragraphs = pMatches
      .map(m => m[1].replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim())
      .filter(text => text.length > 40)
      .slice(0, 12)
      .join("\n\n");

    // Fallback if no clean paragraphs are found
    if (!paragraphs || paragraphs.length < 100) {
      const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      const bodyText = bodyMatch ? bodyMatch[1] : html;
      paragraphs = bodyText
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]*>/g, "")
        .replace(/\s+/g, " ")
        .trim();
    }

    res.json({ 
      title: title.split(" - ")[0].split(" | ")[0], // Clean title a bit
      text: paragraphs.slice(0, 6000) 
    });
  } catch (err) {
    console.error("Scraping error:", err.message);
    res.status(500).json({ error: "Failed to retrieve webpage content. Please ensure the link is valid and accessible." });
  }
});

// Main route
app.get("/news/:district", async (req, res) => {
  const { district } = req.params;

  try {
    const key = district.toLowerCase();
    const keywords = districtKeywords[key] || [key];
    const queryTerms = keywords.map(kw => encodeURIComponent(kw)).join("+OR+");
    // Restrict results to the last 7 days to keep feed fresh, and add cache-buster
    const searchUrl = `https://news.google.com/rss/search?q=(site:eenadu.net+OR+site:sakshi.com+OR+site:andhrajyothy.com)+(${queryTerms})+when:7d&hl=te&gl=IN&ceid=IN:te&_=${Date.now()}`;

    const feed = await parser.parseURL(searchUrl);
    
    const articles = feed.items.map((item) => {
      const { title, source } = cleanTitleAndSource(item.title);
      return {
        title: title,
        description: item.contentSnippet || item.summary || "",
        url: item.link || "",
        source: { name: source },
        publishedAt: item.pubDate || "",
      };
    });

    let filtered = articles;
    if (filtered.length < 5) {
      // General fallback news from last 7 days
      const fallbackUrl = `https://news.google.com/rss/search?q=(site:eenadu.net+OR+site:sakshi.com+OR+site:andhrajyothy.com)+when:7d&hl=te&gl=IN&ceid=IN:te&_=${Date.now()}`;
      try {
        const fallbackFeed = await parser.parseURL(fallbackUrl);
        const fallbackArticles = fallbackFeed.items.map((item) => {
          const { title, source } = cleanTitleAndSource(item.title);
          return {
            title: title,
            description: item.contentSnippet || item.summary || "",
            url: item.link || "",
            source: { name: source },
            publishedAt: item.pubDate || "",
          };
        });
        filtered = [...filtered, ...fallbackArticles];
      } catch (fallbackErr) {
        console.error("Failed to fetch fallback feed:", fallbackErr.message);
      }
    }

    // Sort chronologically (newest first) to ensure the feed always contains the latest updates
    filtered.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

    res.json({ articles: filtered.slice(0, 15) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch news" });
  }
});

// Expose POST endpoints for Groq news summarization to keep API keys secure on the server
app.post("/api/summarize-news", async (req, res) => {
  const { articles, district } = req.body;
  if (!articles || !district) {
    return res.status(400).json({ error: "Articles and district are required" });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Groq API key is not configured on the server." });
  }

  try {
    const articlesToSummarize = articles.slice(0, 5);
    const articlesInput = articlesToSummarize.map((a, i) => {
      return `Article ${i + 1}:\nTitle: ${a.title}\nSource: ${a.source?.name || a.source || "Local News"}\nDescription: ${a.description}\nLink: ${a.url}\n`;
    }).join("\n---\n");

    const systemPrompt = `You are a regional news editor for Andhra Pradesh, India.
You must analyze the provided articles and return a JSON object with EXACTLY the following structure:
{
  "districtSummary": {
    "english": [
      "Bullet point 1 summarizing the overall situation in the district.",
      "Bullet point 2 summarizing another key update in the district.",
      "Bullet point 3 summarizing key regional news."
    ],
    "telugu": [
      "తెలుగులో మొదటి ముఖ్యమైన వార్త సారాంశం.",
      "తెలుగులో రెండవ ముఖ్యమైన వార్త సారాంశం.",
      "తెలుగులో మూడవ ముఖ్యమైన వార్త సారాంశం."
    ]
  },
  "summarizedArticles": [
    {
      "title": "Clean, authoritative headline of Article 1",
      "category": "One-word category tag (e.g., Politics, Finance, Tech, Infrastructure, Crime, Health, Agriculture)",
      "summary": [
        "Concise summary bullet point 1",
        "Concise summary bullet point 2",
        "Concise summary bullet point 3"
      ],
      "source": "Source Name (e.g. Eenadu)",
      "url": "Original article URL"
    }
  ]
}

Ensure the summarizedArticles array contains an item for each article provided (up to 5). Keep summaries crisp, scannable, and extremely readable.`;

    const response = await axios.post("https://api.groq.com/openai/v1/chat/completions", {
      model: "llama-3.1-8b-instant",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Please summarize these articles from ${district} district, Andhra Pradesh:\n\n${articlesInput}`,
        },
      ],
      max_tokens: 1000,
      temperature: 0.4,
    }, {
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      }
    });

    const data = response.data;
    if (!data.choices || data.choices.length === 0) {
      throw new Error("No response from Groq");
    }

    let content = data.choices[0].message.content.trim();
    if (content.startsWith("```json")) {
      content = content.substring(7, content.length - 3).trim();
    } else if (content.startsWith("```")) {
      content = content.substring(3, content.length - 3).trim();
    }

    const result = JSON.parse(content);
    const rawArticlesList = result.summarizedArticles || result.articles || result.news || [];
    const districtSummaryObj = result.districtSummary || { english: [], telugu: [] };
    const finalArticles = Array.isArray(rawArticlesList) ? rawArticlesList : [];

    const mappedArticles = finalArticles.map((sArt, index) => {
      const originalArt = articlesToSummarize[index];
      return {
        title: sArt.title || originalArt?.title || "News Update",
        category: sArt.category || "General",
        summary: Array.isArray(sArt.summary) 
          ? sArt.summary 
          : [sArt.summary || sArt.description || "Read original source for details."],
        url: originalArt ? originalArt.url : (sArt.url || ""),
        source: originalArt 
          ? (originalArt.source?.name || originalArt.source) 
          : (sArt.source || "Local News"),
        publishedAt: originalArt ? originalArt.publishedAt : new Date().toISOString()
      };
    });

    res.json({
      districtSummary: {
        english: Array.isArray(districtSummaryObj.english) 
          ? districtSummaryObj.english 
          : [districtSummaryObj.english || ""],
        telugu: Array.isArray(districtSummaryObj.telugu) 
          ? districtSummaryObj.telugu 
          : [districtSummaryObj.telugu || ""]
      },
      summarizedArticles: mappedArticles
    });
  } catch (error) {
    console.error("Backend news summarization error:", error.message);
    res.status(500).json({ error: error.message || "Failed to summarize news" });
  }
});

app.post("/api/summarize-custom", async (req, res) => {
  const { content, sourceUrl } = req.body;
  if (!content) {
    return res.status(400).json({ error: "Content is required" });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Groq API key is not configured on the server." });
  }

  try {
    const systemPrompt = `You are an expert news editor. Analyze the provided text and extract:
1. An authoritative, bold headline.
2. A single category tag (e.g., Tech, Finance, Politics, Health, Science, World, General).
3. A summary formatted as an array of 3-5 crisp, scannable bullet points (strings).

Return a JSON object with exactly these keys: "title", "category", "summary".`;

    const response = await axios.post("https://api.groq.com/openai/v1/chat/completions", {
      model: "llama-3.1-8b-instant",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Analyze and summarize this content:\n\n${content}`,
        },
      ],
      max_tokens: 600,
      temperature: 0.3,
    }, {
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      }
    });

    const data = response.data;
    if (!data.choices || data.choices.length === 0) {
      throw new Error("No response from Groq");
    }

    let textContent = data.choices[0].message.content.trim();
    if (textContent.startsWith("```json")) {
      textContent = textContent.substring(7, textContent.length - 3).trim();
    } else if (textContent.startsWith("```")) {
      textContent = textContent.substring(3, textContent.length - 3).trim();
    }

    const result = JSON.parse(textContent);
    res.json({
      title: result.title || "Custom Summary",
      category: result.category || "General",
      summary: Array.isArray(result.summary) ? result.summary : [result.summary || ""],
      source: sourceUrl ? new URL(sourceUrl).hostname.replace("www.", "") : "Custom Input",
      url: sourceUrl || "",
      publishedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("Backend custom summary error:", error.message);
    res.status(500).json({ error: error.message || "Failed to generate AI summary" });
  }
});

app.listen(5000, () => {
  console.log("Backend running on http://localhost:5000");
});