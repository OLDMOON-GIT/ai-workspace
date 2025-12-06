
import { GET, POST, PUT, DELETE } from '@/app/api/tasks/route';
import { NextRequest, NextResponse } from 'next/server';
import { getAll, run } from '@/lib/mysql';

jest.mock('@/lib/mysql', () => ({
  getAll: jest.fn(),
  run: jest.fn(),
}));

jest.mock('next/server', () => ({
  NextResponse: {
    json: (data, options) => {
      return new Response(JSON.stringify(data), {
        ...options,
        headers: {
          ...options?.headers,
          'Content-Type': 'application/json',
        },
      });
    },
  },
}));

describe('SPEC-BTS-0000439: Unit Tests for API: /api/tasks', () => {
  const MOCK_TASKS = [
    { id: 'TASK-1', content: 'Test Task 1', status: 'todo', priority: 1, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z', logs: '[]' },
    { id: 'TASK-2', content: 'Test Task 2', status: 'ing', priority: 2, createdAt: '2024-01-02T00:00:00Z', updatedAt: '2024-01-02T00:00:00Z', logs: null },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // --- GET method tests ---
  describe('GET /api/tasks', () => {
    it('should return a 200 OK response with a list of tasks', async () => {
      (getAll as jest.Mock).mockResolvedValue(MOCK_TASKS);

      const request = { url: 'http://localhost/api/tasks', headers: new Headers() } as NextRequest;
      const response = await GET(request);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toHaveProperty('tasks');
      expect(Array.isArray(body.tasks)).toBe(true);
      expect(body.tasks.length).toBe(MOCK_TASKS.length);
      expect(body.tasks[0].logs).toEqual([]);
      expect(body.tasks[1].logs).toEqual([]);
    });

    it('should return an empty array if no tasks are found', async () => {
      (getAll as jest.Mock).mockResolvedValue([]);

      const request = { url: 'http://localhost/api/tasks', headers: new Headers() } as NextRequest;
      const response = await GET(request);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toHaveProperty('tasks');
      expect(Array.isArray(body.tasks)).toBe(true);
      expect(body.tasks.length).toBe(0);
    });

    it('should handle database errors gracefully and return an empty array', async () => {
      (getAll as jest.Mock).mockRejectedValue(new Error('DB connection failed'));

      const request = { url: 'http://localhost/api/tasks', headers: new Headers() } as NextRequest;
      const response = await GET(request);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toHaveProperty('tasks');
      expect(Array.isArray(body.tasks)).toBe(true);
      expect(body.tasks.length).toBe(0);
    });
  });

  // --- POST method tests ---
  describe('POST /api/tasks', () => {
    it('should create a new task successfully', async () => {
      (run as jest.Mock).mockResolvedValue({});
      const newTaskContent = 'New task content';
      const newTaskPriority = 3;

      const request = {
        json: async () => ({ content: newTaskContent, priority: newTaskPriority }),
        headers: new Headers(),
      } as NextRequest;

      const response = await POST(request);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toHaveProperty('success', true);
      expect(body).toHaveProperty('id');
      expect(run).toHaveBeenCalledTimes(1);
      expect(run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO admin_task'),
        [expect.stringContaining('TASK-'), newTaskContent, newTaskPriority]
      );
    });

    it('should return 400 if content is missing', async () => {
      const request = {
        json: async () => ({ priority: 1 }),
        headers: new Headers(),
      } as NextRequest;

      const response = await POST(request);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body).toHaveProperty('error');
    });

    it('should return 500 on database error during creation', async () => {
      (run as jest.Mock).mockRejectedValue(new Error('DB insert failed'));
      const newTaskContent = 'New task content';

      const request = {
        json: async () => ({ content: newTaskContent }),
        headers: new Headers(),
      } as NextRequest;

      const response = await POST(request);

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body).toHaveProperty('error', 'Failed to create task');
    });
  });

  // --- PUT method tests ---
  describe('PUT /api/tasks', () => {
    it('should update task status successfully', async () => {
      (run as jest.Mock).mockResolvedValue({});
      const taskId = 'TASK-1';
      const newStatus = 'done';

      const request = {
        json: async () => ({ id: taskId, status: newStatus }),
        headers: new Headers(),
      } as NextRequest;

      const response = await PUT(request);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toHaveProperty('success', true);
      expect(run).toHaveBeenCalledTimes(1);
      expect(run).toHaveBeenCalledWith(
        expect.stringMatching(/UPDATE admin_task\s+SET\s+updated_at\s*=\s*NOW\(\),\s*status\s*=\s*\?,\s*completed_at\s*=\s*NOW\(\)\s+WHERE\s+id\s*=\s*\?/i),
        [newStatus, taskId]
      );
    });

    it('should update task content and priority successfully', async () => {
      (run as jest.Mock).mockResolvedValue({});
      const taskId = 'TASK-1';
      const newContent = 'Updated content';
      const newPriority = 5;

      const request = {
        json: async () => ({ id: taskId, content: newContent, priority: newPriority }),
        headers: new Headers(),
      } as NextRequest;

      const response = await PUT(request);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toHaveProperty('success', true);
      expect(run).toHaveBeenCalledTimes(1);
      expect(run).toHaveBeenCalledWith(
        expect.stringMatching(/UPDATE admin_task\s+SET\s+updated_at\s*=\s*NOW\(\),\s*content\s*=\s*\?,\s*priority\s*=\s*\?\s+WHERE\s+id\s*=\s*\?/i),
        [newContent, newPriority, taskId]
      );
    });

    it('should return 400 if id is missing', async () => {
      const request = {
        json: async () => ({ status: 'done' }),
        headers: new Headers(),
      } as NextRequest;

      const response = await PUT(request);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body).toHaveProperty('error');
    });

    it('should return 500 on database error during update', async () => {
      (run as jest.Mock).mockRejectedValue(new Error('DB update failed'));
      const taskId = 'TASK-1';
      const newStatus = 'done';

      const request = {
        json: async () => ({ id: taskId, status: newStatus }),
        headers: new Headers(),
      } as NextRequest;

      const response = await PUT(request);

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body).toHaveProperty('error', 'Failed to update task');
    });
  });

  // --- DELETE method tests ---
  describe('DELETE /api/tasks', () => {
    it('should delete a task successfully', async () => {
      (run as jest.Mock).mockResolvedValue({});
      const taskId = 'TASK-1';

      const request = {
        url: `http://localhost/api/tasks?id=${taskId}`,
        headers: new Headers(),
      } as NextRequest;

      const response = await DELETE(request);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toHaveProperty('success', true);
      expect(run).toHaveBeenCalledTimes(1);
      expect(run).toHaveBeenCalledWith(
        'DELETE FROM admin_task WHERE id = ?',
        [taskId]
      );
    });

    it('should return 400 if id is missing', async () => {
      const request = {
        url: 'http://localhost/api/tasks',
        headers: new Headers(),
      } as NextRequest;

      const response = await DELETE(request);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body).toHaveProperty('error');
    });

    it('should return 500 on database error during deletion', async () => {
      (run as jest.Mock).mockRejectedValue(new Error('DB delete failed'));
      const taskId = 'TASK-1';

      const request = {
        url: `http://localhost/api/tasks?id=${taskId}`,
        headers: new Headers(),
      } as NextRequest;

      const response = await DELETE(request);

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body).toHaveProperty('error', 'Failed to delete task');
    });
  });
});
