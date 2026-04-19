// lib/admin/billing.mjs — owns the `plan-usage` action (extracted from admin.mjs)
import { db } from '../db/index.mjs';
import { json } from '../http.mjs';
import { getPlanLimits, countMonthlyPosts } from '../plan-limits.mjs';

// eslint-disable-next-line no-unused-vars
export async function handlePlanUsage(req, ctx) {
  const { user } = ctx;
  const clients = await db.getClients();
  const userPlan = user.plan || 'free';
  const limits = getPlanLimits(userPlan);
  const allClientIds = clients.map(c => c.id);
  const monthlyPosts = await countMonthlyPosts(db.getPosts.bind(db), allClientIds);
  const users = user.role === 'admin' ? await db.listUsers() : [];
  return json({
    plan: userPlan,
    limits,
    usage: {
      postsThisMonth: monthlyPosts,
      clients: clients.length,
      users: users.length || 1,
    },
  });
}
