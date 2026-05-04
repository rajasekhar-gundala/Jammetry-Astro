import type { APIRoute } from 'astro';
import PocketBase from 'pocketbase';

// 👉 CRITICAL for preventing CORS Network Errors!
export const OPTIONS: APIRoute = async () => {
    return new Response(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        }
    });
};

export const POST: APIRoute = async ({ request }) => {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
    };

    try {
        const { message_id, rating } = await request.json();

        if (!message_id || !rating) {
            return new Response(JSON.stringify({ error: "Missing data" }), { 
                status: 400, headers: corsHeaders 
            });
        }

        const pb = new PocketBase(process.env.PB_URL || "http://pocketbase:8080");
        const adminEmail = process.env.PB_ADMIN_EMAIL;
        const adminPass = process.env.PB_ADMIN_PASSWORD;

        if (adminEmail && adminPass) {
            await pb.collection('_superusers').authWithPassword(adminEmail, adminPass);
        }

        await pb.collection('chat_history').update(message_id, {
            feedback: rating
        });

        return new Response(JSON.stringify({ success: true }), { 
            status: 200, headers: corsHeaders 
        });

    } catch (error: any) {
        console.error("Feedback error:", error.message);
        return new Response(JSON.stringify({ error: "Failed to save feedback" }), { 
            status: 500, headers: corsHeaders 
        });
    }
};