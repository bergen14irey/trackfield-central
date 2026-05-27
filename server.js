const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = 3000;
const DB_FILE = path.join(__dirname, 'data.db');

// Middleware
app.use(express.static(path.join(__dirname)));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Allow requests from GitHub Pages and localhost
app.use((req, res, next) => {
    const origin = req.headers.origin || '';
    // Allow your GitHub Pages domain and localhost
    if (origin.includes('github.io') || origin.includes('localhost') || origin.includes('127.0.0.1')) {
        res.header('Access-Control-Allow-Origin', origin);
    } else if (!origin) {
        // Allow requests without origin (e.g., direct API calls)
        res.header('Access-Control-Allow-Origin', '*');
    }
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Allow-Credentials', 'true');
    
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Initialize SQLite DB
const db = new sqlite3.Database(DB_FILE, (err) => {
    if (err) {
        console.error('Could not open database', err);
    } else {
        console.log('Connected to SQLite database');
    }
});

// Ensure table exists (use create_tables.sql if available)
const schemaSql = fs.readFileSync(path.join(__dirname, 'create_tables.sql'), 'utf8');
db.exec(schemaSql, (err) => {
    if (err) console.error('Error initializing database schema:', err);
});

// Ensure gender column exists before proceeding (handles existing DBs)
function ensureGenderColumn(callback) {
    db.all("PRAGMA table_info('records')", (err, rows) => {
        if (err) {
            console.error('Error reading table info:', err);
            if (callback) callback();
            return;
        }
        const hasGender = rows.some(r => r.name === 'gender');
        if (!hasGender) {
            db.run("ALTER TABLE records ADD COLUMN gender TEXT", alterErr => {
                if (alterErr) {
                    console.error('Error adding gender column:', alterErr);
                } else {
                    console.log('Added gender column to records');
                }
                if (callback) callback();
            });
        } else {
            if (callback) callback();
        }
    });
}

// Backfill gender values for rows missing them using athletes.json (best-effort)
function backfillGenderFromJson() {
    const athletesFile = path.join(__dirname, 'athletes.json');
    if (!fs.existsSync(athletesFile)) return;

    try {
        // Ensure column exists before attempting backfill
        db.all("PRAGMA table_info('records')", (infoErr, columns) => {
            if (infoErr) {
                console.error('Error reading table info for backfill:', infoErr);
                return;
            }
            const hasGender = columns.some(c => c.name === 'gender');
            if (!hasGender) {
                console.warn('Skipping gender backfill because column is missing');
                return;
            }

            const data = JSON.parse(fs.readFileSync(athletesFile, 'utf8'));
            const genderLookup = {};
            data.forEach(item => {
                if (!item) return;
                if (item.gender) {
                    const key = `${item.athlete || ''}__${item.event || ''}`;
                    genderLookup[key] = item.gender;
                    if (!genderLookup[item.athlete || '']) {
                        genderLookup[item.athlete || ''] = item.gender;
                    }
                }
            });

            db.all("SELECT id, athlete, event FROM records WHERE gender IS NULL OR gender = ''", (err, rows) => {
                if (err) return console.error('Error selecting rows for gender backfill:', err);
                rows.forEach(row => {
                    const key = `${row.athlete || ''}__${row.event || ''}`;
                    const inferred = genderLookup[key] || genderLookup[row.athlete || ''];
                    if (inferred) {
                        db.run('UPDATE records SET gender = ? WHERE id = ?', [inferred, row.id]);
                    }
                });
            });
        });
    } catch (ex) {
        console.error('Error backfilling gender from athletes.json:', ex);
    }
}

// Helper: parse a free-form PR text into numeric value, type and unit
function parsePr(prText, eventName) {
    if (!prText || typeof prText !== 'string') return null;
    const s = prText.trim();
    const event = eventName || '';

    // points (heptathlon/decathlon)
    const pts = s.match(/(\d{1,3}(?:,\d{3})*|\d+)(?=\s*points?)/i);
    if (pts) {
        return { pr_value: parseFloat(pts[1].replace(/,/g, '')), pr_type: 'other', unit: 'points' };
    }

    // time mm:ss(.ms)
    if (s.includes(':')) {
        const parts = s.match(/(\d+):(\d+(?:\.\d+)?)/);
        if (parts) {
            const mins = parseFloat(parts[1]);
            const secs = parseFloat(parts[2]);
            if (!isNaN(mins) && !isNaN(secs)) return { pr_value: mins * 60 + secs, pr_type: 'time', unit: 's' };
        }
    }

    // Metric meters like "8.55m" or "1.80m"
    const mMatch = s.match(/(\d+\.?\d*)\s*m\b/);
    if (mMatch) {
        const val = parseFloat(mMatch[1]);
        const isHeight = /high jump|pole vault|vault/i.test(event);
        return { pr_value: val, pr_type: isHeight ? 'height' : 'distance', unit: 'm' };
    }

    // Feet + inches like 28'0.5" or 6'0"
    const ftInMatch = s.match(/(\d+)\s*'\s*(\d+(?:\.\d+)?)?\s*(?:\"|in)?/);
    if (ftInMatch) {
        const ft = parseFloat(ftInMatch[1]);
        const inch = ftInMatch[2] ? parseFloat(ftInMatch[2]) : 0;
        if (!isNaN(ft)) {
            const meters = ft * 0.3048 + (inch || 0) * 0.0254;
            const isHeight = /high jump|pole vault|vault/i.test(event);
            return { pr_value: meters, pr_type: isHeight ? 'height' : 'distance', unit: 'm' };
        }
    }

    // Plain numeric value: decide based on event keywords
    const numMatch = s.match(/(\d+\.?\d*)/);
    if (numMatch) {
        const num = parseFloat(numMatch[1]);
        const fieldEvents = /shot put|discus|javelin|long jump|triple jump|high jump|pole vault|vault/i;
        if (fieldEvents.test(event)) {
            const isHeight = /high jump|pole vault|vault/i.test(event);
            return { pr_value: num, pr_type: isHeight ? 'height' : 'distance', unit: 'm' };
        }
        // default to time for most track events
        return { pr_value: num, pr_type: 'time', unit: 's' };
    }

    return null;
}

function seedIfEmpty() {
    db.get('SELECT COUNT(1) as cnt FROM records', (err, row) => {
        if (err) return console.error('DB count error', err);
        if (row.cnt === 0) {
            const athletesFile = path.join(__dirname, 'athletes.json');
            if (fs.existsSync(athletesFile)) {
                try {
                    const data = JSON.parse(fs.readFileSync(athletesFile, 'utf8'));
                    const insert = db.prepare('INSERT INTO records (athlete, event, gender, pr_text, pr_value, pr_type, unit, note, pr_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
                    data.forEach(item => {
                        // Attempt to derive numeric value and type from the JSON pr text if possible
                        // For seed, if pr contains a number, use it; otherwise set 0
                        let prValue = 0;
                        let prType = 'other';
                        let unit = '';
                        // crude parsing: if contains ':' treat as time (mm:ss or seconds)
                        if (typeof item.pr === 'string') {
                            const s = item.pr;
                            const numMatch = s.match(/\d+\.?\d*/g);
                            if (s.includes(':')) {
                                // convert mm:ss.ms to seconds if possible
                                const parts = s.split(':').map(p => parseFloat(p));
                                if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                                    prValue = parts[0] * 60 + parts[1];
                                    prType = 'time';
                                    unit = 's';
                                }
                            } else if (numMatch) {
                                prValue = parseFloat(numMatch[0]);
                                // heuristics: if contains "'" or "ft" treat as feet -> convert not attempted here
                                if (s.includes("m") || s.includes('meter')) {
                                    prType = 'distance';
                                    unit = 'm';
                                } else if (s.includes("'") || s.toLowerCase().includes('ft')) {
                                    prType = 'distance';
                                    unit = 'ft';
                                }
                            }
                        }
                        insert.run(
                            item.athlete || 'Unknown',
                            item.event || 'Unknown',
                            item.gender || '',
                            item.pr || '',
                            prValue || 0,
                            prType,
                            unit || '',
                            'seeded',
                            item.pr_date || ''
                        );
                    });
                    insert.finalize();
                    console.log('Seeded records from athletes.json');
                } catch (ex) {
                    console.error('Error seeding DB from athletes.json', ex);
                }
            }
        }
    });
}

// Ensure migration -> then backfill -> then seed
ensureGenderColumn(() => {
    backfillGenderFromJson();
    seedIfEmpty();
});

// API Routes
// GET all registrations (retrieve data for display) - kept for compatibility
app.get('/api/registrations', (req, res) => {
    db.all('SELECT * FROM records ORDER BY event, pr_value', (err, rows) => {
        if (err) return res.status(500).json({ error: 'Unable to retrieve registrations' });
        res.json(rows);
    });
});

// POST new record (submit form data)
app.post('/api/records', (req, res) => {
    try {
        const { athlete, event, gender, pr_text, pr_date, pr_value: rawPrValue, pr_type: rawPrType, unit: rawUnit, note } = req.body;

        if (!athlete || !event || !gender) {
            return res.status(400).json({ error: 'Missing required fields: athlete, event, and gender are required' });
        }

        let finalPrValue = null;
        let finalPrType = rawPrType || null;
        let finalUnit = rawUnit || '';

        if (rawPrValue !== undefined && rawPrValue !== null && rawPrValue !== '') {
            const n = parseFloat(rawPrValue);
            if (!isNaN(n)) {
                finalPrValue = n;
                if (!finalPrType) finalPrType = 'time';
            }
        }

        if ((finalPrValue === null || isNaN(finalPrValue)) && pr_text) {
            const parsed = parsePr(pr_text, event || '');
            if (parsed) {
                finalPrValue = parsed.pr_value;
                finalPrType = finalPrType || parsed.pr_type;
                finalUnit = finalUnit || parsed.unit || '';
            }
        }

        if (finalPrValue === null || isNaN(finalPrValue) || !finalPrType) {
            return res.status(400).json({ error: 'Unable to determine numeric PR value and type. Provide numeric pr_value/pr_type or a recognizable pr_text.' });
        }

        const stmt = db.prepare('INSERT INTO records (athlete, event, gender, pr_text, pr_value, pr_type, unit, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        stmt.run(athlete, event, gender, pr_text || String(finalPrValue), parseFloat(finalPrValue), finalPrType, finalUnit || '', note || '', function(err) {
            if (err) return res.status(500).json({ error: 'Unable to save record' });
            
            // Also save to athletes.json
            try {
                const athletesFile = path.join(__dirname, 'athletes.json');
                let athletesData = [];
                if (fs.existsSync(athletesFile)) {
                    athletesData = JSON.parse(fs.readFileSync(athletesFile, 'utf8'));
                }
                
                // Append new record in athletes.json format
                athletesData.push({
                    athlete: athlete,
                    event: event,
                    pr: pr_text || String(finalPrValue),
                    gender: gender,
                    pr_date: pr_date || '',
                    note: note || ''
                });
                
                fs.writeFileSync(athletesFile, JSON.stringify(athletesData, null, 2), 'utf8');
                console.log('Saved record to athletes.json');
            } catch (fileErr) {
                console.error('Warning: Could not save to athletes.json:', fileErr);
                // Still return success since DB save worked
            }
            
            res.json({ success: true, id: this.lastID });
        });
        stmt.finalize();
    } catch (error) {
        console.error('Error saving record:', error);
        res.status(500).json({ error: 'Unable to save record' });
    }
});

// GET events (distinct)
app.get('/api/events', (req, res) => {
    db.all('SELECT DISTINCT event FROM records ORDER BY event', (err, rows) => {
        if (err) return res.status(500).json({ error: 'Unable to retrieve events' });
        res.json(rows.map(r => r.event));
    });
});

// GET records with optional filters: ?event=EventName&order=fastest|furthest|highest|alpha&top=N
app.get('/api/records', (req, res) => {
    const event = req.query.event;
    const order = req.query.order || 'best';
    const top = parseInt(req.query.top || '0', 10);

    let sql = 'SELECT * FROM records';
    const params = [];
    if (event) {
        sql += ' WHERE event = ?';
        params.push(event);
    }

    // Determine ordering
    if (order === 'alpha') {
        sql += ' ORDER BY athlete COLLATE NOCASE ASC';
    } else if (order === 'fastest') {
        // smallest pr_value
        sql += ' ORDER BY pr_value ASC';
    } else if (order === 'furthest' || order === 'highest' || order === 'best') {
        // largest pr_value
        sql += ' ORDER BY pr_value DESC';
    } else {
        sql += ' ORDER BY created_at DESC';
    }

    if (top > 0) sql += ' LIMIT ' + top;

    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: 'Unable to retrieve records' });
        res.json(rows);
    });
});

// GET all athletes and their records
app.get('/api/athletes', (req, res) => {
    try {
        const data = fs.readFileSync(path.join(__dirname, 'athletes.json'), 'utf8');
        const athletes = JSON.parse(data);
        res.json(athletes);
    } catch (error) {
        console.error('Error reading athletes:', error);
        res.status(500).json({ error: 'Unable to retrieve athletes' });
    }
});

// Serve HTML files
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/index.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/a.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'a.html'));
});

app.get('/b.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'b.html'));
});

app.get('/success.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'success.html'));
});

// 404 handler
app.use((req, res) => {
    res.status(404).send('Page not found');
});

// Start server
app.listen(PORT, () => {
    console.log(`Track & Field website running at http://localhost:${PORT}`);
    console.log('Press Ctrl+C to stop the server');
});
