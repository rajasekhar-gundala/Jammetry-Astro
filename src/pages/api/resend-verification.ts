import type { APIRoute } from 'astro';
import PocketBase from 'pocketbase';

export const POST: APIRoute = async ({ request }) => {
    const pb = new PocketBase("http://rag-pb:8080");
    
    try {
        const { email } = await request.json();

        if (!email) {
            return new Response(JSON.stringify({ error: "Email is required" }), { status: 400 });
        }

        // Authenticate as Admin to bypass any collection visibility restrictions
        await pb.collection('_superusers').authWithPassword(
            process.env.PB_ADMIN_EMAIL!, 
            process.env.PB_ADMIN_PASSWORD!
        );

        // PocketBase native method to resend verification
        await pb.collection('users').requestVerification(email);

        return new Response(JSON.stringify({ success: true }), { status: 200 });
    } catch (error: any) {
        console.error("Resend Error:", error.message);
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
};