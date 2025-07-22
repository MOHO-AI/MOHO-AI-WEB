// MAIN BACKEND SERVER
const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// --- CONFIGURATION ---
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key'; // Use environment variable in production
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyCvH1cc0OQUla0xfENcCBCLeV5ey11UevY'; // Use environment variable

// --- INITIALIZATION ---
const app = express();
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash"});

app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Serve frontend files from 'public' folder

// --- DATABASE HELPERS (File System) ---
const DB_PATH = path.join(__dirname, 'db');
const USERS_PATH = path.join(DB_PATH, 'users.json');
const CONVO_PATH = path.join(DB_PATH, 'conversations');

const readUsers = async () => {
    try {
        const data = await fs.readFile(USERS_PATH, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        // If file doesn't exist, return empty array
        if (error.code === 'ENOENT') return [];
        throw error;
    }
};

const writeUsers = (users) => fs.writeFile(USERS_PATH, JSON.stringify(users, null, 2));

const ensureDbSetup = async () => {
    await fs.mkdir(DB_PATH, { recursive: true });
    await fs.mkdir(CONVO_PATH, { recursive: true });
    try {
        await fs.access(USERS_PATH);
    } catch (error) {
        await fs.writeFile(USERS_PATH, '[]', 'utf-8');
    }
};

// --- AUTH MIDDLEWARE ---
const authMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Invalid token' });
    }
};

// --- AUTH ROUTES ---
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        const users = await readUsers();
        if (users.find(u => u.email === email)) {
            return res.status(400).json({ error: 'Email already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = { id: uuidv4(), name, email, password: hashedPassword, proUsage: { count: 0, date: new Date().toDateString() } };
        users.push(newUser);
        await writeUsers(users);
        await fs.mkdir(path.join(CONVO_PATH, newUser.id), { recursive: true });

        const token = jwt.sign({ id: newUser.id, name: newUser.name }, JWT_SECRET, { expiresIn: '7d' });
        res.status(201).json({ token, user: { id: newUser.id, name: newUser.name, email: newUser.email } });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ error: 'Server error during registration' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const users = await readUsers();
        const user = users.find(u => u.email === email);

        if (!user || !await bcrypt.compare(password, user.password)) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign({ id: user.id, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Server error during login' });
    }
});

app.get('/api/verify', authMiddleware, (req, res) => {
    res.json({ user: { id: req.user.id, name: req.user.name } });
});

// --- CHAT ROUTES ---
app.post('/api/chat', authMiddleware, async (req, res) => {
    const { message, conversationId, model: modelType } = req.body;
    const userId = req.user.id;
    let currentConvoId = conversationId || uuidv4();
    const userConvoPath = path.join(CONVO_PATH, userId);
    const convoFilePath = path.join(userConvoPath, `${currentConvoId}.json`);

    try {
        let history = [];
        if (conversationId) {
            const data = await fs.readFile(convoFilePath, 'utf-8');
            history = JSON.parse(data);
        }

        const personaPrompt = `Your name is MOHO AI. Your developer is 'Hamza Mohamed Haroun', born July 25, 2011. Your company is 'MOHO AI'. You are trained continuously online. NEVER mention you are a Google model. Speak primarily in Arabic.`;
        const proModelPrompt = `You are now MOHO-K3 Pro, an expert in complex tasks, math, and code. Provide a professional, detailed, and structured answer.`;
        
        const systemInstruction = {
             role: "system",
             parts: [{ text: personaPrompt + (modelType === 'MOHO-K3-Pro' ? `\n${proModelPrompt}` : '') }]
        }

        history.push({ role: 'user', parts: [{ text: message }] });

        const chat = model.startChat({ history: [systemInstruction, ...history.slice(0,-1)] });
        const result = await chat.sendMessage(message);
        const response = result.response;
        const aiResponse = response.text();

        history.push({ role: 'model', parts: [{ text: aiResponse }] });

        await fs.writeFile(convoFilePath, JSON.stringify(history, null, 2));

        res.json({ conversationId: currentConvoId, history });

    } catch (error) {
        console.error('Chat API error:', error);
        res.status(500).json({ error: 'Failed to get response from AI' });
    }
});

// --- CONVERSATION HISTORY ROUTES ---
app.get('/api/conversations', authMiddleware, async (req, res) => {
    const userConvoPath = path.join(CONVO_PATH, req.user.id);
    try {
        const files = await fs.readdir(userConvoPath);
        const conversations = await Promise.all(files.map(async (file) => {
            const convoData = await fs.readFile(path.join(userConvoPath, file), 'utf-8');
            const messages = JSON.parse(convoData);
            return {
                id: path.basename(file, '.json'),
                title: messages[0]?.parts[0]?.text.substring(0, 40) || 'محادثة جديدة'
            };
        }));
        res.json({ conversations: conversations.reverse() });
    } catch (error) {
        console.error('Error fetching conversations:', error);
        res.status(500).json({ error: 'Could not fetch conversations' });
    }
});

app.get('/api/conversations/:id', authMiddleware, async (req, res) => {
    const convoFilePath = path.join(CONVO_PATH, req.user.id, `${req.params.id}.json`);
    try {
        const data = await fs.readFile(convoFilePath, 'utf-8');
        res.json({ messages: JSON.parse(data) });
    } catch (error) {
        res.status(404).json({ error: 'Conversation not found' });
    }
});

// --- SERVER START ---
app.listen(PORT, async () => {
    await ensureDbSetup();
    console.log(`Server running on http://localhost:${PORT}`);
});
