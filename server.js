const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const TURNSTILE_SECRET = process.env.TURNSTILE_SECRET || '1x0000000000000000000000000000000AA';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'vdj-admin-2026';
const SUGGESTIONS_FILE = path.join(__dirname, 'suggestions.json');

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(__dirname));

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

function readSuggestions() {
    try {
        const data = fs.readFileSync(SUGGESTIONS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        return { suggestions: [] };
    }
}

function writeSuggestions(data) {
    fs.writeFileSync(SUGGESTIONS_FILE, JSON.stringify(data, null, 2));
}

async function verifyTurnstile(token) {
    try {
        const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                secret: TURNSTILE_SECRET,
                response: token
            })
        });
        const data = await response.json();
        return data.success;
    } catch (err) {
        return false;
    }
}

app.post('/api/suggest', async (req, res) => {
    const { artist, song, youtube, 'cf-turnstile-response': turnstileToken } = req.body;

    if (!artist || !song || !youtube) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    const ytPattern = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)[a-zA-Z0-9_-]{11}/;
    if (!ytPattern.test(youtube)) {
        return res.status(400).json({ error: 'Invalid YouTube URL' });
    }

    if (!turnstileToken) {
        return res.status(400).json({ error: 'Captcha verification required' });
    }

    const verified = await verifyTurnstile(turnstileToken);
    if (!verified) {
        return res.status(400).json({ error: 'Captcha verification failed' });
    }

    const data = readSuggestions();
    const newSuggestion = {
        id: crypto.randomUUID(),
        artist: artist.trim(),
        song: song.trim(),
        youtube: youtube.trim(),
        status: 'pending',
        submittedAt: new Date().toISOString()
    };

    data.suggestions.unshift(newSuggestion);
    writeSuggestions(data);

    res.json({ success: true, message: 'Suggestion submitted' });
});

app.get('/api/suggestions', (req, res) => {
    const data = readSuggestions();
    res.json({ suggestions: data.suggestions });
});

app.post('/api/admin/suggest/:id/approve', (req, res) => {
    const { password } = req.body;
    if (password !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const data = readSuggestions();
    const suggestion = data.suggestions.find(s => s.id === req.params.id);
    if (!suggestion) {
        return res.status(404).json({ error: 'Suggestion not found' });
    }

    suggestion.status = 'approved';
    writeSuggestions(data);
    res.json({ success: true });
});

app.post('/api/admin/suggest/:id/reject', (req, res) => {
    const { password } = req.body;
    if (password !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const data = readSuggestions();
    const suggestion = data.suggestions.find(s => s.id === req.params.id);
    if (!suggestion) {
        return res.status(404).json({ error: 'Suggestion not found' });
    }

    suggestion.status = 'rejected';
    writeSuggestions(data);
    res.json({ success: true });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
