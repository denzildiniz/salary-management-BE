import { Request, Response } from 'express';
import { getAnalytics } from '../services/analytics.service';
import { parseAndExecuteQuery } from '../queryEngine';

export async function analyticsHandler(_req: Request, res: Response): Promise<void> {
  const data = await getAnalytics();
  res.json(data);
}

export async function naturalQueryHandler(req: Request, res: Response): Promise<void> {
  const queryStr = req.query.q as string;
  if (!queryStr) {
    res.status(400).json({ error: 'Query string parameter "q" is required.' });
    return;
  }
  const result = await parseAndExecuteQuery(queryStr);
  res.json(result);
}
