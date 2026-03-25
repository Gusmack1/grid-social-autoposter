// Plan tier limits — maps plan name to resource limits
// Used by admin.mjs to enforce post/client/user caps

export const PLAN_LIMITS = {
  free:       { postsPerMonth: 1,    clients: 1,  users: 1,  bulkImportMax: 1   },
  starter:    { postsPerMonth: 300,  clients: 10, users: 2,  bulkImportMax: 50  },
  agency:     { postsPerMonth: 1500, clients: 25, users: 5,  bulkImportMax: 200 },
  agency_pro: { postsPerMonth: -1,   clients: 50, users: -1, bulkImportMax: 500 }, // -1 = unlimited
  enterprise: { postsPerMonth: -1,   clients: -1, users: -1, bulkImportMax: -1  },
};

export function getPlanLimits(plan) {
  return PLAN_LIMITS[plan] || PLAN_LIMITS.free;
}

/**
 * Count posts created this month for a given client list
 * @param {Function} getPostsFn - async fn(clientId) => posts[]
 * @param {string[]} clientIds - array of client IDs to check
 * @returns {number} total posts created this calendar month
 */
export async function countMonthlyPosts(getPostsFn, clientIds) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  let total = 0;
  for (const cid of clientIds) {
    try {
      const posts = await getPostsFn(cid);
      total += posts.filter(p => p.createdAt >= monthStart).length;
    } catch { /* skip */ }
  }
  return total;
}

/**
 * Check if an action is within plan limits
 * @returns {{ allowed: boolean, reason?: string, usage?: object }}
 */
export async function checkPlanLimit(plan, action, context = {}) {
  const limits = getPlanLimits(plan);

  if (action === 'add-post' || action === 'post-now') {
    if (limits.postsPerMonth === -1) return { allowed: true };
    const { monthlyPosts = 0 } = context;
    if (monthlyPosts >= limits.postsPerMonth) {
      return {
        allowed: false,
        reason: `Monthly post limit reached (${monthlyPosts}/${limits.postsPerMonth}). Upgrade your plan for more posts.`,
        usage: { used: monthlyPosts, limit: limits.postsPerMonth },
      };
    }
    return { allowed: true, usage: { used: monthlyPosts, limit: limits.postsPerMonth } };
  }

  if (action === 'bulk-import') {
    if (limits.postsPerMonth === -1) return { allowed: true };
    const { monthlyPosts = 0, importCount = 0 } = context;
    // Check bulk import batch size
    if (limits.bulkImportMax !== -1 && importCount > limits.bulkImportMax) {
      return {
        allowed: false,
        reason: `Bulk import limited to ${limits.bulkImportMax} posts per import on your plan.`,
      };
    }
    // Check monthly total
    if (monthlyPosts + importCount > limits.postsPerMonth) {
      const remaining = Math.max(0, limits.postsPerMonth - monthlyPosts);
      return {
        allowed: false,
        reason: `Monthly post limit would be exceeded. You have ${remaining} posts remaining this month.`,
        usage: { used: monthlyPosts, limit: limits.postsPerMonth, importing: importCount },
      };
    }
    return { allowed: true };
  }

  if (action === 'add-client') {
    if (limits.clients === -1) return { allowed: true };
    const { clientCount = 0 } = context;
    if (clientCount >= limits.clients) {
      return {
        allowed: false,
        reason: `Client limit reached (${clientCount}/${limits.clients}). Upgrade your plan to add more clients.`,
        usage: { used: clientCount, limit: limits.clients },
      };
    }
    return { allowed: true };
  }

  return { allowed: true };
}
