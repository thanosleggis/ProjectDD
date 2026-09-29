const express = require('express');
const app = express();
const cors = require('cors');
const path = require('path');
const { spawn } = require('child_process');
const corsOptions = {
    origin: 'http://localhost:5173',
};
// Χρήση mysql2 για συμβατότητα με MySQL 8+
const mysql = require('mysql2');
// Διαθέσιμες εκδόσεις harvester: DEMO (CSV) και REAL (API)
const harvesterDemoPath = path.join(__dirname, '..', 'harvester_demo_csv.py');
const harvesterRealPath = path.join(__dirname, '..', 'harvester.py');
const clusteringPath = path.join(__dirname, '..', 'spark', 'clustering_job.py');
const similarityPath = path.join(__dirname, '..', 'spark', 'similarity_job.py');

app.use(cors(corsOptions));
app.use(express.json());

const db = mysql.createPool({
    connectionLimit: 10,
    host: 'localhost',
    user: 'root',
    password: '123456',
    database: 'CourseAggregatorDB'
});

function dbQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.query(sql, params, (err, results) => {
            if (err) return reject(err);
            resolve(results);
        });
    });
}

function toInt(value, fallback) {
    const n = Number.parseInt(String(value ?? ''), 10);
    return Number.isFinite(n) ? n : fallback;
}

function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
}

// 1. ΛΙΣΤΑ ΜΑΘΗΜΑΤΩΝ (Διορθωμένο lv.display_name)
async function listCourses(req, res) {
    try {
        const page = clamp(toInt(req.query.page, 1), 1, 10_000);
        const limit = clamp(toInt(req.query.limit, 20), 1, 100);
        const offset = (page - 1) * limit;

        const filters = [];
        const params = [];
        const searchTerm = (req.query.q ?? req.query.search ?? '').toString().trim();
        if (searchTerm) {
            filters.push('(c.title LIKE ? OR c.short_description LIKE ? OR c.full_description LIKE ?)');
            params.push(`%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`);
        }

        const languageId = req.query.languageId ?? req.query.language;
        const levelId = req.query.levelId ?? req.query.level;
        const sourceId = req.query.sourceId ?? req.query.source;
        const tag = (req.query.tag ?? req.query.tagId ?? req.query.categoryId ?? req.query.category ?? '').toString().trim();

        if (languageId) {
            filters.push('c.language_id = ?');
            params.push(languageId);
        }
        if (levelId) {
            filters.push('c.level_id = ?');
            params.push(levelId);
        }
        if (sourceId) {
            filters.push('c.source_id = ?');
            params.push(sourceId);
        }
        if (tag) {
            filters.push('cct.top_terms LIKE ?');
            params.push(`%${tag}%`);
        }

        const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

        const dataSql = `
            SELECT DISTINCT c.*, s.name as source_name, l.name as language_name, lv.display_name as level_name,
                   cl.cluster_id, cct.top_terms AS cluster_label
            FROM courses c
            LEFT JOIN sources s ON c.source_id = s.id
            LEFT JOIN languages l ON c.language_id = l.id
            LEFT JOIN levels lv ON c.level_id = lv.id
            LEFT JOIN course_clusters cl ON cl.id = c.id
            LEFT JOIN course_cluster_terms cct ON cl.cluster_id = cct.cluster_id
            ${whereClause}
            ORDER BY c.id DESC
            LIMIT ? OFFSET ?
        `;

        const countSql = `
            SELECT COUNT(DISTINCT c.id) as total
            FROM courses c
            LEFT JOIN course_clusters cl ON cl.id = c.id
            LEFT JOIN course_cluster_terms cct ON cl.cluster_id = cct.cluster_id
            ${whereClause}
        `;

        const [courses, [{ total }]] = await Promise.all([
            dbQuery(dataSql, [...params, limit, offset]),
            dbQuery(countSql, params),
        ]);

        const totalPages = Math.max(1, Math.ceil(total / limit));

        res.json({
            data: courses,
            pagination: { totalItems: total, page, limit, totalPages },
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch courses', details: err?.message ?? String(err) });
    }
}

// 2. ΛΕΠΤΟΜΕΡΕΙΕΣ ΜΑΘΗΜΑΤΟΣ (Διορθωμένο lv.display_name)
async function getCourseDetails(req, res) {
    try {
        const id = toInt(req.params.id);
        const sql = `
            SELECT c.*, s.name as source_name, l.name as language_name, lv.display_name as level_name,
                   cl.cluster_id, cct.top_terms AS cluster_label
            FROM courses c
            LEFT JOIN sources s ON c.source_id = s.id
            LEFT JOIN languages l ON c.language_id = l.id
            LEFT JOIN levels lv ON c.level_id = lv.id
            LEFT JOIN course_clusters cl ON cl.id = c.id
            LEFT JOIN course_cluster_terms cct ON cl.cluster_id = cct.cluster_id
            WHERE c.id = ?
        `;
        const results = await dbQuery(sql, [id]);
        if (results.length === 0) return res.status(404).json({ error: 'Course not found' });
        const base = results[0];

        res.json(base);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch course details', details: err?.message ?? String(err) });
    }
}

// 3. SIMILAR COURSES
async function getSimilarCourses(req, res) {
    try {
        const id = toInt(req.params.id);
        const sql = `
            SELECT c.*, cs.score as similarity_score
            FROM courses c
            JOIN course_similarities cs ON c.id = cs.target_course_id
            WHERE cs.source_course_id = ?
            ORDER BY cs.score DESC
            LIMIT 5
        `;
        const results = await dbQuery(sql, [id]);
        res.json(results);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch similar courses', details: err?.message ?? String(err) });
    }
}

// 4b. STATS VIEW
async function getStats(req, res) {
    try {
        const rows = await dbQuery('SELECT * FROM vw_stats_courses_per_source');
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch stats', details: err?.message ?? String(err) });
    }
}

// 4. ΣΥΓΧΡΟΝΙΣΜΟΣ (τρέχει harvester + clustering + similarity)
async function syncSource(req, res) {
    try {
        const modeRaw = (req.query.mode || (req.body && req.body.mode) || 'real').toString().toLowerCase();
        const mode = modeRaw === 'demo' ? 'demo' : 'real';
        const harvesterPath = mode === 'demo' ? harvesterDemoPath : harvesterRealPath;

        // 4.1 Καθαρισμός παλιών δεδομένων (κρατάμε μόνο τους sources)
        try {
            console.log('[Sync] Clearing old data (keeping sources)...')
            await dbQuery('SET FOREIGN_KEY_CHECKS = 0')
            await dbQuery('TRUNCATE TABLE course_similarities')
            await dbQuery('TRUNCATE TABLE course_clusters')
            await dbQuery('TRUNCATE TABLE course_cluster_terms')
            await dbQuery('TRUNCATE TABLE courses')
            await dbQuery('TRUNCATE TABLE languages')
            await dbQuery('TRUNCATE TABLE levels')
            await dbQuery('TRUNCATE TABLE categories')
            await dbQuery('SET FOREIGN_KEY_CHECKS = 1')
            console.log('[Sync] Old data cleared successfully.')
        } catch (cleanupErr) {
            console.error('[Sync] Failed to clear old data', cleanupErr)
            return res.status(500).json({ error: 'Failed to clear old data before sync', details: String(cleanupErr) })
        }

        const harvestStdout = [];
        const harvestStderr = [];

        const harvestProc = spawn('python', [harvesterPath], {
            cwd: path.join(__dirname, '..'),
        });

        harvestProc.stdout.on('data', (data) => {
            harvestStdout.push(data.toString());
            console.log(`Harvester: ${data}`);
        });
        harvestProc.stderr.on('data', (data) => {
            harvestStderr.push(data.toString());
            console.error(`Harvester Error: ${data}`);
        });

        harvestProc.on('error', (err) => {
            res.status(500).json({ error: 'Failed to start harvester', stderr: String(err) });
        });

        harvestProc.on('close', (harvestCode) => {
            const harvestOut = harvestStdout.join('');
            const harvestErr = harvestStderr.join('');
            if (harvestCode !== 0) {
                res.status(500).json({
                    error: `Sync failed (harvester exit ${harvestCode})`,
                    mode,
                    harvestExitCode: harvestCode,
                    harvestStdout: harvestOut,
                    harvestStderr: harvestErr,
                });
                return;
            }
            // Run clustering job after harvest succeeds
            const clusterStdout = [];
            const clusterStderr = [];
            const clusterProc = spawn('python', [clusteringPath], {
                cwd: path.join(__dirname, '..', 'spark'),
            });

            clusterProc.stdout.on('data', (data) => {
                clusterStdout.push(data.toString());
                console.log(`Clustering: ${data}`);
            });
            clusterProc.stderr.on('data', (data) => {
                clusterStderr.push(data.toString());
                console.error(`Clustering Error: ${data}`);
            });

            clusterProc.on('error', (err) => {
                res.status(500).json({
                    error: 'Failed to start clustering job',
                    mode,
                    harvestExitCode: harvestCode,
                    harvestStdout: harvestOut,
                    harvestStderr: harvestErr,
                    stderr: String(err),
                });
            });

            clusterProc.on('close', (clusterCode) => {
                const clusterOut = clusterStdout.join('');
                const clusterErr = clusterStderr.join('');
                if (clusterCode !== 0) {
                    res.status(500).json({
                        error: `Clustering job failed (exit ${clusterCode})`,
                        mode,
                        harvestExitCode: harvestCode,
                        clusterExitCode: clusterCode,
                        harvestStdout: harvestOut,
                        harvestStderr: harvestErr,
                        clusteringStdout: clusterOut,
                        clusteringStderr: clusterErr,
                    });
                    return;
                }

                // Run similarity job after clustering succeeds
                const simStdout = [];
                const simStderr = [];
                const simProc = spawn('python', [similarityPath], {
                    cwd: path.join(__dirname, '..', 'spark'),
                });

                simProc.stdout.on('data', (data) => {
                    simStdout.push(data.toString());
                    console.log(`Similarity: ${data}`);
                });
                simProc.stderr.on('data', (data) => {
                    simStderr.push(data.toString());
                    console.error(`Similarity Error: ${data}`);
                });

                simProc.on('error', (err) => {
                    res.status(500).json({
                        error: 'Failed to start similarity job',
                        mode,
                        harvestExitCode: harvestCode,
                        clusterExitCode: clusterCode,
                        harvestStdout: harvestOut,
                        harvestStderr: harvestErr,
                        clusteringStdout: clusterOut,
                        clusteringStderr: clusterErr,
                        stderr: String(err),
                    });
                });

                simProc.on('close', (simCode) => {
                    const simOut = simStdout.join('');
                    const simErr = simStderr.join('');
                    if (simCode === 0) {
                        res.json({
                            message: 'Sync + clustering + similarity completed successfully',
                            mode,
                            harvestExitCode: harvestCode,
                            clusterExitCode: clusterCode,
                            similarityExitCode: simCode,
                            harvestStdout: harvestOut,
                            harvestStderr: harvestErr,
                            clusteringStdout: clusterOut,
                            clusteringStderr: clusterErr,
                            similarityStdout: simOut,
                            similarityStderr: simErr,
                        });
                    } else {
                        res.status(500).json({
                            error: `Similarity job failed (exit ${simCode})`,
                            mode,
                            harvestExitCode: harvestCode,
                            clusterExitCode: clusterCode,
                            similarityExitCode: simCode,
                            harvestStdout: harvestOut,
                            harvestStderr: harvestErr,
                            clusteringStdout: clusterOut,
                            clusteringStderr: clusterErr,
                            similarityStdout: simOut,
                            similarityStderr: simErr,
                        });
                    }
                });
            });
        });
    } catch (err) {
        console.error('Sync error', err);
        res.status(500).json({ error: 'Sync failed to start', stderr: String(err) });
    }
}

// 5. ΦΙΛΤΡΑ (languages, levels, sources, tags from cluster terms)
async function getFilters(req, res) {
    try {
        const [languages, levels, sources, clusterTerms] = await Promise.all([
            dbQuery('SELECT id, name FROM languages ORDER BY name ASC'),
            dbQuery('SELECT id, display_name FROM levels ORDER BY id ASC'),
            dbQuery('SELECT id, name FROM sources ORDER BY name ASC'),
            dbQuery('SELECT top_terms FROM course_cluster_terms'),
        ]);

        const tagSet = new Set();
        for (const row of clusterTerms) {
            if (!row.top_terms) continue;
            row.top_terms
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean)
                .forEach((t) => tagSet.add(t));
        }
        const tags = Array.from(tagSet)
            .sort((a, b) => a.localeCompare(b))
            .map((name) => ({ id: name, name }));

        res.json({ languages, levels, sources, categories: tags });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to load filters', details: err?.message ?? String(err) });
    }
}

// Endpoints
app.get(['/courses', '/api/courses'], listCourses);
app.get(['/courses/:id', '/api/courses/:id'], getCourseDetails);
app.get(['/courses/:id/similar', '/api/courses/:id/similar'], getSimilarCourses);
app.post(['/sync', '/api/sync', '/sync/:source', '/api/sync/:source'], syncSource);
app.get(['/filters', '/api/filters'], getFilters);
app.get(['/stats', '/api/stats'], getStats);

const PORT = 8080;
app.listen(PORT, () => {
    console.log(`Back-end Server running on http://localhost:${PORT}`);
});