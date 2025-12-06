
const mysql = require('mysql2/promise');

const MY_PID = process.pid;

const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: 'trend2024',
  database: 'trend_video'
};

async function claimBug(bugId, workerId) {
  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);

    const [result] = await connection.execute(
      `
        UPDATE bugs
        SET worker_pid = ?,
            assigned_to = ?,
            status = 'in_progress',
            updated_at = NOW()
        WHERE id = ? AND status = 'open'
      `,
      [MY_PID, workerId, bugId]
    );

    if (result.affectedRows === 0) {
      console.log(`Bug BTS-${bugId} could not be claimed. It might already be in progress or resolved.`);
    } else {
      console.log(`Bug BTS-${bugId} claimed by PID ${MY_PID} and assigned to ${workerId}.`);
    }
  } catch (error) {
    console.error('Error claiming bug:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

const bugId = 3049; // The bug ID we are claiming
const workerId = 'Gemini'; // The AI agent claiming the bug

claimBug(bugId, workerId);
