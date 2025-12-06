const mysql = require('mysql2/promise');

async function createBug(type = 'bug', title, summary, priority = 'P3') {
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'trend2024',
    database: 'trend_video'
  });

  try {
    const taskData = {
      type: type,
      title: title || `[${type.toUpperCase()}] New ${type} created`, // Default title if not provided
      summary: summary || `A new ${type} for the project.`, // Default summary if not provided
      status: 'open',
      metadata: JSON.stringify({
        source: 'auto-generated',
        category: 'enhancement',
        priority: priority,
        severity: 'MEDIUM',
        error_type: `${type}-creation`,
        full_content: `## 📋 Basic Information

- **Title**: ${title || `[${type.toUpperCase()}] New ${type} created`}
- **Type**: ${type}
- **Summary**: ${summary || `A new ${type} for the project.`}
- **Priority**: ${priority}
- **Status**: open
- **Created By**: Gemini

## Description

${summary || `A new ${type} for the project. Further details to be added.`}
`
      })
    };

    const [result] = await connection.query(
      'INSERT INTO bugs (type, title, summary, status, metadata, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NOW(), NOW())',
      [taskData.type, taskData.title, taskData.summary, taskData.status, taskData.metadata]
    );

    console.log(`✅ ${taskData.type.toUpperCase()} created with ID: ${result.insertId} - ${taskData.title}`);

  } finally {
    await connection.end();
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
let taskType = 'bug';
let taskTitle = '';
let taskSummary = '';
let taskPriority = 'P3';

if (args.length > 0) {
  if (args[0].startsWith('BTS-')) { // If the first argument is a bug ID, treat it as title
    taskTitle = args[0];
    taskSummary = args[1];
    taskPriority = args[2] || 'P3';
  } else { // Otherwise, treat it as type
    taskType = args[0];
    taskTitle = args[1];
    taskSummary = args[2];
    taskPriority = args[3] || 'P3';
  }
}

createBug(taskType, taskTitle, taskSummary, taskPriority).catch(console.error);
