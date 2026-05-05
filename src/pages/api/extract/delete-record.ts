export const prerender = false;

export async function POST({ request, locals }) {
    try {
        const { id, ids } = await request.json();
        const pb = locals.pb;

        await pb.collection("_superusers").authWithPassword(
            import.meta.env.PB_ADMIN_EMAIL, 
            import.meta.env.PB_ADMIN_PASSWORD
        );

        // Handle Bulk Delete
        if (ids && Array.isArray(ids)) {
            await Promise.all(ids.map(itemId => pb.collection('sales_data').delete(itemId)));
        } 
        // Handle Single Delete (Backward compatibility)
        else if (id) {
            await pb.collection('sales_data').delete(id);
        }

        return new Response(JSON.stringify({ success: true }), { status: 200 });
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
}