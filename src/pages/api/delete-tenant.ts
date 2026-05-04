import type { APIRoute } from 'astro';

export const DELETE: APIRoute = async ({ url, locals }) => {
    // 1. Security Check
    if (!locals.pb.authStore.isValid) {
        return new Response("Unauthorized", { status: 401 });
    }

    const id = url.searchParams.get('id');

    if (!id) {
        return new Response("Missing tenant ID", { status: 400 });
    }

    try {
        // 2. Delete from PocketBase
        await locals.pb.collection('tenants').delete(id);

        return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        });
    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), { 
            status: 500 
        });
    }
};
