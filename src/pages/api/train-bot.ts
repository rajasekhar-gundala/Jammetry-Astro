import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request, locals }) => {
    // Security check
    if (!locals.user) return new Response("Unauthorized", { status: 401 });

    let tenantId = "";

    try {
        const formData = await request.formData();
        tenantId = formData.get('id')?.toString() || "";
        const trainingType = formData.get('training_type')?.toString();

        if (!tenantId || !trainingType) {
            return new Response("Missing required fields", { status: 400 });
        }

        // Verify the user owns this tenant before triggering resources
        await locals.pb.collection('tenants').getOne(tenantId);

        // Set status to processing BEFORE calling Node.js
        await locals.pb.collection('tenants').update(tenantId, {
            training_status: 'processing'
        });

        // --- NODE.JS BACKEND CONNECTION ---
        // 👉 NEW: Added /api to the base URL to match our new Express routes!
        const nodeBaseUrl = "http://backend:3000/api"; 
        let response;

        if (trainingType === 'url' || trainingType === 'api') {
            const source = formData.get('source')?.toString();
            if (!source) throw new Error("Missing source URL");

            // MATCHES NODE.JS: /api/ingest/url/{tenant_id} OR /api/ingest/api/{tenant_id}
            const endpoint = trainingType === 'url' ? `/ingest/url/${tenantId}` : `/ingest/api/${tenantId}`;
            
            response = await fetch(`${nodeBaseUrl}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: source }) 
            });

        } else if (trainingType === 'file') {
            const file = formData.get('file') as File;
            if (!file || file.size === 0) throw new Error("Missing file document");

            const nodeFormData = new FormData();
            nodeFormData.append('file', file);

            // MATCHES NODE.JS: /api/ingest/upload/{tenant_id}
            response = await fetch(`${nodeBaseUrl}/ingest/upload/${tenantId}`, {
                method: 'POST',
                body: nodeFormData 
            });
        }

        if (!response || !response.ok) {
            throw new Error(`Backend rejected the request. Status: ${response?.status}`);
        }

        // Redirect back to the UI with a success banner
        return new Response(null, {
            status: 303,
            headers: { "Location": `/dashboard/tenants/${tenantId}?train_success=true` }
        });

    } catch (error: any) {
        console.error("Training trigger failed:", error.message);
        
        // Reset status to error if Astro couldn't reach Node.js
        if (tenantId) {
            try {
                await locals.pb.collection('tenants').update(tenantId, { training_status: 'error' });
            } catch (pbError) {
                console.error("Failed to reset PB status");
            }
        }

        const fallbackUrl = tenantId ? `/dashboard/tenants/${tenantId}?train_error=true` : `/dashboard/tenants`;
        return new Response(null, {
            status: 303,
            headers: { "Location": fallbackUrl }
        });
    }
};