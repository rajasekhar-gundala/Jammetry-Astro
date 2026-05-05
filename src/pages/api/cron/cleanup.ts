// src/pages/api/cron/cleanup.ts
export const GET: APIRoute = async ({ request }) => {
    // 1. Check for a secret auth header so random people can't trigger your cleanup
    if (request.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
        return new Response("Unauthorized", { status: 401 });
    }

    // 2. Find documents older than 60 days
    const thirtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    
    // 3. Delete them from PocketBase (and trigger your LanceDB deletion logic)
    // You would query PB where `created < thirtyDaysAgo` and delete them.
    
    return new Response("Cleanup complete", { status: 200 });
};