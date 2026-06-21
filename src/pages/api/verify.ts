import type { APIRoute } from 'astro';
import PocketBase from 'pocketbase';

export const GET: APIRoute = async ({ request }) => {
    const url = new URL(request.url);
    const token = url.searchParams.get('token');

    if (!token) {
        return new Response("Invalid or missing verification token.", { status: 400 });
    }

    const pb = new PocketBase("http://rag-pb:8080");

    try {
        // 1. Tell PocketBase to verify the user
        await pb.collection('users').confirmVerification(token);

        // 2. Decode the JWT payload to find out WHICH user just clicked the link
        const payloadBase64 = token.split('.')[1];
        const payloadBuffer = Buffer.from(payloadBase64, 'base64');
        const payload = JSON.parse(payloadBuffer.toString('utf-8'));
        const userId = payload.id;

        // 3. Authenticate as Admin to securely look up their Tenant ID
        let tenantId = 'PENDING_ID';
        if (userId) {
            await pb.collection('_superusers').authWithPassword(
                process.env.PB_ADMIN_EMAIL!, 
                process.env.PB_ADMIN_PASSWORD!
            );
            
            try {
                // Find the tenant where this user is the owner
                const tenant = await pb.collection('tenants').getFirstListItem(`owner="${userId}"`);
                tenantId = tenant.id;
            } catch (err) {
                console.error("Tenant not found for verified user:", userId);
            }
        }

        // 4. Redirect them to the welcome page WITH their dynamic Tenant ID
        return new Response(null, {
            status: 303,
            headers: { "Location": `/welcome?id=${tenantId}` }
        });

    } catch (error: any) {
        console.error("Verification Error:", error.message);
        // If the token is expired or used, send them to login
        return new Response(null, {
            status: 303,
            headers: { "Location": "/login?error=verification-failed" }
        });
    }
};