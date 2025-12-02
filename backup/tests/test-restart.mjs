

const url = 'http://localhost:3000/api/debug-restart-script';
const scriptId = 'c05100ea-4ef7-4151-bd1c-69b515ba48cf';

async function run() {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ scriptId }),
    });

    const data = await response.json();
    console.log('Status:', response.status);
    console.log('Response:', data);

    if (!response.ok) {
      console.error('Request failed');
      process.exit(1);
    } else {
      console.log('Request successful');
    }
  } catch (error) {
    console.error('Error during fetch:', error);
    process.exit(1);
  }
}

run();
