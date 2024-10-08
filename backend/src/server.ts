import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import { sendEmailToAdmins } from './services/email.service';
import { generateHtmlResponse } from './services/html.service';
import { checkAuthorization } from './services/authorize.service';

// Initialize environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT;
const FRONTEND_PORT = process.env.FRONTEND_PORT;
const SERVER_DOMAIN = process.env.SERVER_DOMAIN;
const SECRET_KEY = process.env.SECRET_KEY;

// PostgreSQL client setup
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.connect((err) => {
  if (err) {
    console.error('Database connection error', err.stack);
  } else {
    console.log('Connected to the database');
  }
});

// Enable CORS and JSON parsing
app.use(cors({
  origin: `${SERVER_DOMAIN}:${FRONTEND_PORT}`, // Allow the frontend origin
}));
app.use(express.json());

// Test route
app.get('/api', (req, res) => {
  res.send({ message: 'Backend is running' });
});

// Add memory form submission route
app.post('/api/add-memory', async (req, res) => {
  const { firstName, nickname, lastName, relation, message } = req.body;

  try {
    const query = `
      INSERT INTO pending_memories (first_name, nickname, last_name, relation, message)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *;
    `;

    const values = [firstName, nickname, lastName, relation, message];
    const result = await pool.query(query, values);

    // Send an email to admins to review the memory
    sendEmailToAdmins(result.rows[0]);

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Error inserting memory into the database', err);
    res.status(500).json({ success: false, message: 'Database error' });
  }
});

app.get('/api/memories', async (req, res) => {
  const {limit} = req.query;

  try {
    let query = 'SELECT * FROM memories';
    const values = [];

    // If a limit is specified, ensure it's a number and return that number of random memories
    if (typeof limit === 'string' && !isNaN(parseInt(limit, 10))) {
      query += ' ORDER BY RANDOM() LIMIT $1';
      values.push(parseInt(limit, 10));
    }

    const result = await pool.query(query, values);
    res.status(200).json({success:true, memories: result.rows});
  } catch (err) {
    console.error('Error fetching memories from the database', err);
    res.status(500).json({ success: false, message: 'Database error' });
  }
});

app.get('/api/memories/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const query = 'SELECT * FROM memories WHERE id = $1';
    const values = [id];
    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Memory not found' });
    }

    res.status(200).json({ success: true, memory: result.rows[0] });
  } catch (err) {
    console.error('Error fetching memory from the database', err);
    res.status(500).json({ success: false, message: 'Database error' });
  }
});

app.get('/api/approve-memory/:id', async (req, res) => {
  const memoryId = await checkAuthorization(req, res, SECRET_KEY, pool);
  if (!memoryId) return; // Stop execution if authorization failed

  // Move memory from pending_memories to memories
  const query = `
    WITH moved_memory AS (
      DELETE FROM pending_memories WHERE id = $1 RETURNING *
    )
    INSERT INTO memories (id, first_name, nickname, last_name, relation, message)
    SELECT id, first_name, nickname, last_name, relation, message FROM moved_memory
    RETURNING *;
  `;

  pool.query(query, [memoryId], (err, result) => {
    if (err) {
      console.error('Error approving memory', err);
      return res.status(500).send(generateHtmlResponse('Error', 'Failed to approve memory.', false));
    }

    res.send(generateHtmlResponse('Memory Approved', 'The memory has been successfully approved.', true));
  });
});

app.get('/api/reject-memory/:id', async (req, res) => {
  const memoryId =  await checkAuthorization(req, res, SECRET_KEY, pool);
  if (!memoryId) return; // Stop execution if authorization failed

  // Delete the memory from pending_memories
  const query = 'DELETE FROM pending_memories WHERE id = $1';

  pool.query(query, [memoryId], (err) => {
    if (err) {
      console.error('Error rejecting memory', err);
      return res.status(500).send(generateHtmlResponse('Error', 'Failed to reject memory.', false));
    }

    res.send(generateHtmlResponse('Memory Rejected', 'The memory has been successfully rejected.', true));
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});