import { GET } from '@/app/api/tasks/route';
import { NextRequest } from 'next/server';
import { getAll } from '@/lib/mysql';

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

jest.mock('@/lib/mysql', () => ({
  getAll: jest.fn(),
  getOne: jest.fn(),
  run: jest.fn(),
}));

describe('GET /api/tasks (BTS-0000430)', () => {

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return a 200 OK response with a list of tasks', async () => {
    // Mock the getAll function to return some tasks
    (getAll as jest.Mock).mockResolvedValue([
      { id: '1', content: 'Task 1', status: 'todo', priority: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), logs: '[]' },
      { id: '2', content: 'Task 2', status: 'ing', priority: 2, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), logs: null },
      { id: '3', content: 'Task 3', status: 'done', priority: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), logs: 'invalid-json' },
    ]);

    const request = {
      url: 'http://localhost/api/tasks',
      headers: new Headers(),
    } as NextRequest;

    const response = await GET(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty('tasks');
    expect(Array.isArray(body.tasks)).toBe(true);
    expect(body.tasks.length).toBe(3);
    expect(body.tasks[0].logs).toEqual([]);
    expect(body.tasks[1].logs).toEqual([]);
    expect(body.tasks[2].logs).toEqual([]);
  });

  it('should handle database errors gracefully', async () => {
    // Mock the getAll function to throw an error
    (getAll as jest.Mock).mockRejectedValue(new Error('DB Error'));

    const request = {
      url: 'http://localhost/api/tasks',
      headers: new Headers(),
    } as NextRequest;

    const response = await GET(request);

    // Even with a DB error, the API should return a non-500 status and an empty array
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty('tasks');
    expect(Array.isArray(body.tasks)).toBe(true);
    expect(body.tasks.length).toBe(0);
  });
});
