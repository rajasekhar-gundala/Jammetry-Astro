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

        // Verify the user owns this tenant before triggering python resources
        await locals.pb.collection('tenants').getOne(tenantId);

        // 👉 NEW: Set status to processing BEFORE calling Python
        await locals.pb.collection('tenants').update(tenantId, {
            training_status: 'processing'
        });

        // --- PYTHON BACKEND CONNECTION ---
        // Change "python-backend" to the actual name of your Python docker container
        // If your container is named something else (e.g., "backend", "api"), change it here!
        const pythonBaseUrl = "http://backend:3000"; 
        let response;

        if (trainingType === 'url' || trainingType === 'api') {
            const source = formData.get('source')?.toString();
            if (!source) throw new Error("Missing source URL");

            // MATCHES PYTHON: /ingest/url/{tenant_id} OR /ingest/api/{tenant_id}
            const endpoint = trainingType === 'url' ? `/ingest/url/${tenantId}` : `/ingest/api/${tenantId}`;
            
            response = await fetch(`${pythonBaseUrl}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                // MATCHES PYTHON: expects {"url": "..."}
                body: JSON.stringify({ url: source }) 
            });

        } else if (trainingType === 'file') {
            const file = formData.get('file') as File;
            if (!file || file.size === 0) throw new Error("Missing file document");

            // File uploads require a new FormData object to stream it to Python
            const pythonFormData = new FormData();
            pythonFormData.append('file', file); // MATCHES PYTHON: expects a field named 'file'

            // MATCHES PYTHON: /ingest/upload/{tenant_id}
            response = await fetch(`${pythonBaseUrl}/ingest/upload/${tenantId}`, {
                method: 'POST',
                body: pythonFormData // Note: no headers needed, fetch sets boundaries automatically for FormData
            });
        }

        if (!response || !response.ok) {
            throw new Error(`Python backend rejected the request. Status: ${response?.status}`);
        }

        // Redirect back to the UI with a success banner
        return new Response(null, {
            status: 303,
            headers: { "Location": `/dashboard/tenants/${tenantId}?train_success=true` }
        });

    } catch (error: any) {
        console.error("Training trigger failed:", error.message);
        
        // 👉 NEW: Reset status to error if Astro couldn't reach Python
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