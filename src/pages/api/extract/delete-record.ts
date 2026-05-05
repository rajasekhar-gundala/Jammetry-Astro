import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request, locals }) => {
    // 1. Security Check: Ensure the user is logged in
    if (!locals.user) {
        return new Response(JSON.stringify({ error: 'Unauthorized. Please log in.' }), { status: 401 });
    }

    try {
        // 2. Parse the incoming JSON payload from the frontend
        const body = await request.json();
        const { id, ids } = body;
        
        // Grab the authenticated PocketBase instance from Astro.locals
        const pb = locals.pb;

        // 3. Scenario A: Bulk Deletion (Array of IDs)
        if (ids && Array.isArray(ids)) {
            // Delete each record one by one
            for (const recordId of ids) {
                // PocketBase's API rules will automatically ensure the user owns this record
                await pb.collection('sales_data').delete(recordId);
            }
            return new Response(JSON.stringify({ success: true }), { status: 200 });
        }

        // 4. Scenario B: Single Deletion (One ID)
        if (id) {
            await pb.collection('sales_data').delete(id);
            return new Response(JSON.stringify({ success: true }), { status: 200 });
        }

        // 5. If neither id nor ids were provided
        return new Response(JSON.stringify({ error: 'No record ID(s) provided for deletion.' }), { status: 400 });

    } catch (error: any) {
        console.error('🔥 Delete Record Error:', error.message);
        return new Response(JSON.stringify({ error: error.message || 'Failed to delete record.' }), { status: 500 });
    }
};