import 'dotenv/config';
import { createApp } from './app';
import { initDb } from './db';

const PORT = process.env.PORT || 3001;

async function main() {
  await initDb();
  const app = createApp();
  app.listen(PORT, () => {
    console.log(`ACME Salary Management backend running on http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
